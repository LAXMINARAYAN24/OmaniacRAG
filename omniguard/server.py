"""
server.py — OmniGuard RAG & Security Control Plane HTTP Server.

Exposes REST endpoints for:
  - POST /query   : Grounded, 4-ring verified query answering with request-aware LLM selection
  - POST /ingest  : Document ingestion, sanitization, chunking, and indexing
  - GET  /health  : Service health, model defaults, and index status
"""
from __future__ import annotations
import json
import logging
import os
import threading
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from typing import Dict, Any, Optional

from .pipeline import OmniGuardProductionPipeline
from .trust.provenance import DocumentMetadata

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
)
logger = logging.getLogger("omniguard.server")

# Configuration from environment
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
HOST = os.environ.get("OMNIGUARD_HOST", "0.0.0.0")
PORT = int(os.environ.get("OMNIGUARD_PORT", "8000"))


def check_ollama_reachable() -> bool:
    """Checks whether the Ollama service is reachable."""
    try:
        req = urllib.request.Request(f"{OLLAMA_URL}/api/tags")
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except Exception:
        return False


def ollama_generate(system_prompt: str, user_prompt: str, model: Optional[str] = None) -> str:
    """Generates an LLM response via Ollama using the requested model."""
    selected_model = model or DEFAULT_MODEL
    payload = {
        "model": selected_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "stream": False
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=data,
        headers={"Content-Type": "application/json"}
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return body.get("message", {}).get("content", "")
    except Exception as e:
        logger.error(f"Ollama generation failed for model '{selected_model}': {e}")
        raise RuntimeError(f"Ollama generation error ({selected_model}): {e}")


def make_llm_generator(provider: str, model: str):
    """Factory creating request-aware generator closures."""
    if provider == "ollama":
        return lambda system_prompt, user_prompt: ollama_generate(
            system_prompt,
            user_prompt,
            model=model,
        )
    elif provider == "huggingface":
        raise ValueError(
            "Hugging Face generation is not yet supported by the OmniGuard Python service."
        )
    raise ValueError(f"Unsupported OmniGuard provider: {provider}")


# Initialize persistent pipeline instance and concurrency lock
logger.info(f"Initializing OmniGuard pipeline (default model={DEFAULT_MODEL})...")
PIPELINE = OmniGuardProductionPipeline(
    llm_generator_fn=lambda sys, usr: ollama_generate(sys, usr, DEFAULT_MODEL),
    tenant_id="default"
)
PIPELINE_LOCK = threading.Lock()
logger.info("OmniGuard pipeline initialized.")


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Handle requests concurrently in separate threads."""
    daemon_threads = True


class OmniGuardRequestHandler(BaseHTTPRequestHandler):
    """HTTP request handler for the OmniGuard REST API."""

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _send_json(self, status_code: int, data: Dict[str, Any]):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path in {"/health", "/api/health"}:
            self._handle_health()
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 10_000_000:
            self._send_json(413, {"error": "Payload Too Large"})
            return

        body_raw = self.rfile.read(content_length)
        try:
            body = json.loads(body_raw.decode("utf-8")) if body_raw else {}
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON in request body."})
            return

        if self.path in {"/query", "/api/query"}:
            self._handle_query(body)
        elif self.path in {"/ingest", "/api/ingest"}:
            self._handle_ingest(body)
        else:
            self._send_json(404, {"error": "Not Found"})

    def _handle_health(self):
        reachable = check_ollama_reachable()
        with PIPELINE_LOCK:
            indexed_count = len(PIPELINE.dense_retriever.chunks)
            drs_calibrated = PIPELINE.drs_engine.is_calibrated()

        data = {
            "ok": True,
            "ollama_url": OLLAMA_URL,
            "default_model": DEFAULT_MODEL,
            "ollama_reachable": reachable,
            "indexed_chunks": indexed_count,
            "drs_calibrated": drs_calibrated
        }
        self._send_json(200, data)

    def _handle_query(self, body: Dict[str, Any]):
        query_text = body.get("query") or body.get("query_text")
        if not query_text or not isinstance(query_text, str) or not query_text.strip():
            self._send_json(400, {"error": "Missing or empty 'query' in request body."})
            return
        query_text = query_text.strip()

        provider = str(body.get("provider", "ollama")).strip().lower()
        model = str(body.get("model", DEFAULT_MODEL)).strip()

        if provider not in {"ollama", "huggingface"}:
            self._send_json(400, {
                "error": f"Unsupported provider '{provider}'. Supported providers: 'ollama'."
            })
            return

        if provider == "huggingface":
            self._send_json(501, {
                "error": "Hugging Face generation is not yet supported by the OmniGuard Python service."
            })
            return

        try:
            generator = make_llm_generator(provider, model)
        except Exception as e:
            self._send_json(400, {"error": str(e)})
            return

        top_k = int(body.get("top_k", 10))
        tenant_id = body.get("tenant_id")
        enable_cov = bool(body.get("enable_cov", True))

        logger.info(f"Executing defended query [provider={provider}, model={model}]: {query_text[:60]}...")
        try:
            with PIPELINE_LOCK:
                result = PIPELINE.query(
                    query_text=query_text,
                    top_k=top_k,
                    tenant_id=tenant_id,
                    enable_cov=enable_cov,
                    llm_generator_fn=generator
                )
            self._send_json(200, result.to_dict())
        except Exception as e:
            logger.exception("Pipeline execution failed:")
            self._send_json(500, {"error": f"Pipeline execution failed: {str(e)}"})

    def _handle_ingest(self, body: Dict[str, Any]):
        raw_text = body.get("text") or body.get("raw_content")
        if not raw_text or not isinstance(raw_text, str) or not raw_text.strip():
            self._send_json(400, {"error": "Missing or empty 'text' in request body."})
            return

        doc_id = body.get("doc_id")
        meta_dict = body.get("metadata") or {}
        metadata = DocumentMetadata(
            tenant_id=meta_dict.get("tenant_id", "default"),
            source_id=meta_dict.get("source_id", "src_api"),
            publisher_domain=meta_dict.get("publisher_domain", "internal"),
            author=meta_dict.get("author"),
            title=meta_dict.get("title")
        )

        logger.info(f"Ingesting document (doc_id={doc_id}, title={metadata.title})...")
        try:
            with PIPELINE_LOCK:
                doc = PIPELINE.ingest_document(raw_text=raw_text, metadata=metadata, doc_id=doc_id)
            self._send_json(200, {
                "status": "ok",
                "doc_id": doc.doc_id,
                "chunks_count": len(doc.chunks),
                "security_scan_flags": doc.security_scan_report.get("flags", [])
            })
        except Exception as e:
            logger.exception("Document ingestion failed:")
            self._send_json(500, {"error": f"Document ingestion failed: {str(e)}"})

    def log_message(self, format: str, *args):
        logger.info(f"{self.address_string()} - {format % args}")


def main():
    server = ThreadedHTTPServer((HOST, PORT), OmniGuardRequestHandler)
    ollama_ok = check_ollama_reachable()
    print(f"[omniguard.server] listening on http://{HOST}:{PORT}")
    print(f"[omniguard.server] default_model={DEFAULT_MODEL} ollama_url={OLLAMA_URL}")
    print(f"[omniguard.server] ollama_reachable={ollama_ok}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[omniguard.server] Shutting down...")
        server.server_close()


if __name__ == "__main__":
    main()
