export type ModelProvider = "anthropic" | "google" | "openai" | "mistral";

export type ModelStatus = "available" | "unavailable" | "deprecated";

export interface AIModel {
  id: string;
  name: string;
  provider: ModelProvider;
  description: string;
  contextWindow: number;
  status: ModelStatus;
  deprecatedAt?: string;
  replacedBy?: string;
  tags: string[];
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
  modelId?: string;
}

export interface ChatRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  modelId: string;
  conversationId?: string;
}