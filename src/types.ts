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

export interface ChatMessagePayload {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessagePayload[];
  modelId: string;
  conversationId?: string;
}

export interface AuthRequest {
  email: string;
  password: string;
  name?: string;
}

// Estende o Request do Express para incluir o userId autenticado
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}