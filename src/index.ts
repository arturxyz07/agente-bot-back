import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import { AI_MODELS, getModelById, checkModelAvailability } from "./models";
import {
  streamAnthropicResponse,
  streamGoogleResponse,
  streamOpenAIResponse,
} from "./ai-providers";
import { ChatRequest } from "./types";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// GET /api/ia/models
app.get("/api/ia/models", (_req: Request, res: Response) => {
  const modelsWithAvailability = AI_MODELS.map((model) => ({
    ...model,
    isKeyConfigured:
      model.status === "deprecated" ? false : checkModelAvailability(model),
  }));

  res.json({ models: modelsWithAvailability });
});

// POST /api/chat
app.post("/api/chat", async (req: Request, res: Response) => {
  try {
    const body: ChatRequest = req.body;
    const { messages, modelId } = body;

    if (!modelId || !messages || messages.length === 0) {
      res.status(400).json({ error: "Parâmetros inválidos" });
      return;
    }

    const model = getModelById(modelId);

    if (!model) {
      res.status(404).json({ error: "Modelo não encontrado" });
      return;
    }

    if (model.status === "deprecated") {
      res.status(410).json({
        error: "deprecated",
        message: `Este modelo foi descontinuado${model.deprecatedAt ? ` em ${model.deprecatedAt}` : ""}.${model.replacedBy ? ` Use ${model.replacedBy} como substituto.` : ""}`,
      });
      return;
    }

    if (!checkModelAvailability(model)) {
      res.status(503).json({
        error: "unavailable",
        message: `Chave de API para ${model.provider} não configurada. Adicione a chave no arquivo .env.`,
      });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const onChunk = (text: string) => {
      const data = JSON.stringify({ type: "chunk", content: text });
      res.write(`data: ${data}\n\n`);
    };

    try {
      let usage = { inputTokens: 0, outputTokens: 0 };

      switch (model.provider) {
        case "anthropic":
          usage = await streamAnthropicResponse(model, messages, onChunk);
          break;
        case "openai":
          usage = await streamOpenAIResponse(model, messages, onChunk);
          break;
        case "google":
          usage = await streamGoogleResponse(model, messages, onChunk);
          break;
        default:
          throw new Error(`Provider ${model.provider} não suportado`);
      }

      const doneData = JSON.stringify({
        type: "done",
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        },
      });
      res.write(`data: ${doneData}\n\n`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro desconhecido";
      const errorData = JSON.stringify({ type: "error", message });
      res.write(`data: ${errorData}\n\n`);
    } finally {
      res.end();
    }
  } catch {
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ agente-bot backend rodando em http://localhost:${PORT}`);
});