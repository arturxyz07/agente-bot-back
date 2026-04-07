import { AIModel } from "./types";

export const AI_MODELS: AIModel[] = [
  {
    id: "claude-opus-4-5",
    name: "Claude Opus 4.5",
    provider: "anthropic",
    description: "Modelo mais avançado da Anthropic, com raciocínio profundo e capacidades de agência.",
    contextWindow: 200000,
    status: "available",
    tags: ["poderoso", "agência", "raciocínio"],
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    description: "Equilíbrio ideal entre inteligência e velocidade. Ótimo para tarefas do dia a dia.",
    contextWindow: 200000,
    status: "available",
    tags: ["balanceado", "rápido", "eficiente"],
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    description: "Modelo mais rápido e compacto da Anthropic. Ideal para tarefas simples e rápidas.",
    contextWindow: 200000,
    status: "available",
    tags: ["rápido", "econômico", "leve"],
  },
  {
    id: "claude-3-opus-20240229",
    name: "Claude 3 Opus",
    provider: "anthropic",
    description: "Modelo Claude 3 Opus — substituído pela família Claude 4.",
    contextWindow: 200000,
    status: "deprecated",
    deprecatedAt: "2025-08",
    replacedBy: "claude-opus-4-5",
    tags: ["descontinuado"],
  },
  {
    id: "claude-2.1",
    name: "Claude 2.1",
    provider: "anthropic",
    description: "Versão legada do Claude. Não recomendado para novos projetos.",
    contextWindow: 200000,
    status: "deprecated",
    deprecatedAt: "2024-03",
    replacedBy: "claude-sonnet-4-5",
    tags: ["legado", "descontinuado"],
  },
  {
    id: "claude-instant-1.2",
    name: "Claude Instant 1.2",
    provider: "anthropic",
    description: "Versão instant legada da Anthropic, descontinuada.",
    contextWindow: 100000,
    status: "deprecated",
    deprecatedAt: "2024-01",
    replacedBy: "claude-haiku-4-5",
    tags: ["legado", "descontinuado"],
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    description: "Modelo multimodal rápido e eficiente do Google com contexto longo.",
    contextWindow: 1048576,
    status: "available",
    tags: ["multimodal", "rápido", "longo contexto"],
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    description: "Modelo multimodal rápido e eficiente do Google com contexto longo.",
    contextWindow: 1048576,
    status: "available",
    tags: ["multimodal", "rápido", "longo contexto"],
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "google",
    description: "Modelo pro do Google com janela de contexto de 1 milhão de tokens.",
    contextWindow: 1048576,
    status: "available",
    tags: ["longo contexto", "multimodal", "poderoso"],
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    provider: "google",
    description: "Versão flash do Gemini 1.5, equilibrando velocidade e capacidade.",
    contextWindow: 1048576,
    status: "available",
    tags: ["rápido", "eficiente", "multimodal"],
  },
  {
    id: "gemini-1.0-pro",
    name: "Gemini 1.0 Pro",
    provider: "google",
    description: "Primeira geração do Gemini Pro. Descontinuado em favor do Gemini 1.5.",
    contextWindow: 32760,
    status: "deprecated",
    deprecatedAt: "2025-02",
    replacedBy: "gemini-1.5-pro",
    tags: ["descontinuado", "legado"],
  },
  {
    id: "bard",
    name: "Bard",
    provider: "google",
    description: "Assistente original do Google baseado em LaMDA/PaLM. Renomeado para Gemini.",
    contextWindow: 8000,
    status: "deprecated",
    deprecatedAt: "2023-12",
    replacedBy: "gemini-1.5-pro",
    tags: ["descontinuado", "legado"],
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "Modelo multimodal flagship da OpenAI, com capacidades de voz e visão.",
    contextWindow: 128000,
    status: "available",
    tags: ["multimodal", "flagship", "visão"],
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Versão compacta do GPT-4o. Rápido e econômico para tarefas cotidianas.",
    contextWindow: 128000,
    status: "available",
    tags: ["econômico", "rápido", "eficiente"],
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    description: "Versão turbo do GPT-4 com contexto de 128k. Substituído pelo GPT-4o.",
    contextWindow: 128000,
    status: "deprecated",
    deprecatedAt: "2025-04",
    replacedBy: "gpt-4o",
    tags: ["descontinuado"],
  },
  {
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    provider: "openai",
    description: "O modelo que popularizou os chatbots de IA. Descontinuado em favor do GPT-4o mini.",
    contextWindow: 16385,
    status: "deprecated",
    deprecatedAt: "2025-09",
    replacedBy: "gpt-4o-mini",
    tags: ["descontinuado", "legado"],
  },
  {
    id: "gpt-4",
    name: "GPT-4",
    provider: "openai",
    description: "Modelo GPT-4 original lançado em 2023. Descontinuado.",
    contextWindow: 8192,
    status: "deprecated",
    deprecatedAt: "2025-06",
    replacedBy: "gpt-4o",
    tags: ["descontinuado", "legado"],
  },
  {
    id: "davinci-002",
    name: "Davinci 002",
    provider: "openai",
    description: "Modelo legado da família GPT-3. Completamente descontinuado.",
    contextWindow: 16385,
    status: "deprecated",
    deprecatedAt: "2024-01",
    replacedBy: "gpt-4o-mini",
    tags: ["descontinuado", "legado", "GPT-3"],
  },
];

export function getModelById(id: string): AIModel | undefined {
  return AI_MODELS.find((m) => m.id === id);
}

export function checkModelAvailability(model: AIModel): boolean {
  if (model.status === "deprecated") return false;
  switch (model.provider) {
    case "anthropic":
      return !!process.env.ANTHROPIC_API_KEY;
    case "google":
      return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    case "openai":
      return !!process.env.OPENAI_API_KEY;
    case "mistral":
      return !!process.env.MISTRAL_API_KEY;
    default:
      return false;
  }
}