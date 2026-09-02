export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface LLMProvider {
  chat(
    message: string,
    history: ChatMessage[],
    model: string
  ): Promise<string>;
}
