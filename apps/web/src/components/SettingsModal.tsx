import { useEffect, useState } from "react";
import type { Settings } from "../types";

type Props = {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onClose: () => void;
};

export function SettingsModal({
  settings,
  onChange,
  onClose
}: Props) {
  const [draft, setDraft] = useState(settings);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState("");

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    if (draft.provider !== "ollama") {
      setModels([]);
      return;
    }

    async function loadModels() {
      setLoadingModels(true);
      setModelError("");

      try {
        const response = await fetch(
          `${draft.backendUrl}/api/models`
        );

        if (!response.ok) {
          throw new Error(`Failed to load models: ${response.status}`);
        }

        const data = await response.json();

        const availableModels = Array.isArray(data.models)
          ? data.models
          : [];

        setModels(availableModels);

        if (
          availableModels.length > 0 &&
          !availableModels.includes(draft.model)
        ) {
          setDraft((current) => ({
            ...current,
            model: availableModels[0]
          }));
        }
      } catch (error) {
        setModelError(
          error instanceof Error
            ? error.message
            : "Could not load Ollama models."
        );
      } finally {
        setLoadingModels(false);
      }
    }

    loadModels();
  }, [draft.backendUrl, draft.provider]);

  function save() {
    onChange(draft);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-gray-900">
            Settings
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="text-2xl leading-none text-gray-400 hover:text-gray-700"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-900">
              Backend URL
            </label>

            <input
              type="text"
              value={draft.backendUrl}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  backendUrl: event.target.value
                })
              }
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base outline-none focus:border-gray-400"
              placeholder="http://localhost:3000"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-900">
              Provider
            </label>

            <select
              value={draft.provider}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  provider: event.target.value as Settings["provider"]
                })
              }
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base outline-none focus:border-gray-400"
            >
              <option value="ollama">Ollama</option>
              <option value="huggingface">Hugging Face</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-900">
              Model
            </label>

            {draft.provider === "ollama" ? (
              <>
                <select
                  value={draft.model}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      model: event.target.value
                    })
                  }
                  disabled={loadingModels || models.length === 0}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base outline-none focus:border-gray-400 disabled:cursor-not-allowed disabled:bg-gray-100"
                >
                  {models.length === 0 ? (
                    <option value="">
                      {loadingModels
                        ? "Loading Ollama models..."
                        : "No Ollama models found"}
                    </option>
                  ) : (
                    models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))
                  )}
                </select>

                {modelError && (
                  <p className="mt-2 text-sm text-red-600">
                    {modelError}
                  </p>
                )}

                {!loadingModels && models.length > 0 && (
                  <p className="mt-2 text-xs text-gray-400">
                    Detected {models.length} Ollama model
                    {models.length === 1 ? "" : "s"}.
                  </p>
                )}
              </>
            ) : (
              <input
                type="text"
                value={draft.model}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    model: event.target.value
                  })
                }
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base outline-none focus:border-gray-400"
                placeholder="Enter Hugging Face model"
              />
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-semibold text-gray-900 cursor-pointer flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.mode === "omniguard"}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        mode: event.target.checked ? "omniguard" : "direct"
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>Enable OmniGuard-RAG Protection</span>
                </label>
                <p className="mt-1 text-xs text-gray-500">
                  Wraps generation with verified retrieval, spectral DRS defense, consensus checks, and citation grounding.
                </p>
              </div>
            </div>

            {draft.mode === "omniguard" && (
              <div className="mt-3.5 border-t border-gray-200 pt-3">
                <label className="mb-1.5 block text-xs font-semibold text-gray-800">
                  OmniGuard Service URL
                </label>
                <input
                  type="text"
                  value={draft.omniguardUrl || "http://localhost:8000"}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      omniguardUrl: event.target.value
                    })
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
                  placeholder="http://localhost:8000"
                />
                <p className="mt-1.5 text-[11px] text-gray-400">
                  The selected LLM ({draft.provider}: {draft.model || "..."}) will still generate responses; OmniGuard acts as the secure RAG defense layer.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={save}
            disabled={!draft.model}
            className="w-full rounded-xl bg-gray-900 py-3 text-base font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>

        <p className="mt-5 text-xs text-gray-400">
          API secrets should stay on the backend, never in browser code.
        </p>
      </div>
    </div>
  );
}
