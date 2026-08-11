export type ModelProvider =
  | "anthropic"
  | "google"
  | "openai"
  | "mistral";

export type ModelStatus =
  | "available"
  | "unavailable"
  | "deprecated";

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

export interface ImageAttachment {
  url: string;
  publicId: string;
  mimeType: string;

  width?: number;
  height?: number;
  bytes?: number;
}

export interface ChatMessagePayload {
  role: "user" | "assistant";
  content: string;
  images?: ImageAttachment[];
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

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
