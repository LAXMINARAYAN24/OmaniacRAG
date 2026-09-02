import type { ChatMessage, LLMProvider } from "../types.js";

export class HuggingFaceProvider implements LLMProvider {
  async chat(
    _message: string,
    _history: ChatMessage[],
    _model: string
  ): Promise<string> {
    throw new Error(
      "Hugging Face provider is not configured yet. Add your server-side HF inference call in providers/huggingface.ts."
    );
  }
}