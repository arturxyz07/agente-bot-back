import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { connectDB, User, Conversation } from "./db";
import { AI_MODELS, getModelById, checkModelAvailability } from "./models";
import {
  streamAnthropicResponse,
  streamGoogleResponse,
  streamOpenAIResponse,
} from "./ai-providers";
import { authMiddleware } from "./authMiddleware";
import { ChatRequest, AuthRequest } from "./types";

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "secret";

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/register
app.post("/api/auth/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password }: AuthRequest = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: "Nome, email e senha são obrigatórios." });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });
      return;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ error: "Este email já está em uso." });
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hash });

    const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

// POST /api/auth/login
app.post("/api/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password }: AuthRequest = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email e senha são obrigatórios." });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ error: "Email ou senha incorretos." });
      return;
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      res.status(401).json({ error: "Email ou senha incorretos." });
      return;
    }

    const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

// GET /api/auth/me  (valida token e retorna usuário)
app.get("/api/auth/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }
    res.json({ user: { id: user._id, name: user.name, email: user.email } });
  } catch {
    res.status(500).json({ error: "Erro interno." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MODELS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/ia/models
app.get("/api/ia/models", (_req: Request, res: Response) => {
  const modelsWithAvailability = AI_MODELS.map((model) => ({
    ...model,
    isKeyConfigured:
      model.status === "deprecated" ? false : checkModelAvailability(model),
  }));
  res.json({ models: modelsWithAvailability });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATIONS (requerem autenticação)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/conversations  — lista todas as conversas do usuário
app.get("/api/conversations", authMiddleware, async (req: Request, res: Response) => {
  try {
    const conversations = await Conversation.find({ userId: req.userId })
      .select("_id modelId title createdAt updatedAt")
      .sort({ updatedAt: -1 });

    res.json({ conversations });
  } catch {
    res.status(500).json({ error: "Erro ao buscar conversas." });
  }
});

// POST /api/conversations  — cria nova conversa
app.post("/api/conversations", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { modelId, title } = req.body;
    if (!modelId) {
      res.status(400).json({ error: "modelId é obrigatório." });
      return;
    }
    const conv = await Conversation.create({
      userId: req.userId,
      modelId,
      title: title || "Nova conversa",
      messages: [],
    });
    res.status(201).json({ conversation: conv });
  } catch {
    res.status(500).json({ error: "Erro ao criar conversa." });
  }
});

// GET /api/conversations/:id  — retorna conversa com mensagens
app.get("/api/conversations/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const conv = await Conversation.findOne({ _id: req.params.id, userId: req.userId });
    if (!conv) {
      res.status(404).json({ error: "Conversa não encontrada." });
      return;
    }
    res.json({ conversation: conv });
  } catch {
    res.status(500).json({ error: "Erro ao buscar conversa." });
  }
});

// DELETE /api/conversations/:id  — apaga uma conversa
app.delete("/api/conversations/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const conv = await Conversation.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!conv) {
      res.status(404).json({ error: "Conversa não encontrada." });
      return;
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Erro ao apagar conversa." });
  }
});

// DELETE /api/conversations/:id/messages  — limpa mensagens (Desafio Hacker)
app.delete("/api/conversations/:id/messages", authMiddleware, async (req: Request, res: Response) => {
  try {
    const conv = await Conversation.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { messages: [], title: "Nova conversa", updatedAt: new Date() },
      { new: true }
    );
    if (!conv) {
      res.status(404).json({ error: "Conversa não encontrada." });
      return;
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Erro ao limpar mensagens." });
  }
});

// PATCH /api/conversations/:id/title  — renomeia conversa
app.patch("/api/conversations/:id/title", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    const conv = await Conversation.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { title },
      { new: true }
    );
    if (!conv) {
      res.status(404).json({ error: "Conversa não encontrada." });
      return;
    }
    res.json({ conversation: conv });
  } catch {
    res.status(500).json({ error: "Erro ao renomear conversa." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHAT  (requer autenticação)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/chat
// POST /api/chat
app.post("/api/chat", authMiddleware, async (req: Request, res: Response) => {
  try {
    const body: ChatRequest = req.body;
    const { messages, modelId, conversationId } = body;

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
        message: `Chave de API para ${model.provider} não configurada.`,
      });
      return;
    }

    const userMessage = messages[messages.length - 1];

    let conv: InstanceType<typeof Conversation> | null = null;

    // 🔎 tenta buscar conversa existente
    if (conversationId && mongoose.isValidObjectId(conversationId)) {
      conv = await Conversation.findOne({
        _id: conversationId,
        userId: req.userId,
      });
    }

    // 🚀 CRIA conversa automaticamente se não existir
    if (!conv) {
      conv = await Conversation.create({
        userId: req.userId,
        modelId,
        title: userMessage.content.slice(0, 50),
        messages: [],
      });
    }

    // 💾 salva mensagem do usuário
    conv.messages.push({
      role: "user",
      content: userMessage.content,
      createdAt: new Date(),
    });

    // 🧠 atualiza título se for primeira mensagem
    if (conv.messages.length === 1 && conv.title === "Nova conversa") {
      conv.title = userMessage.content.slice(0, 50);
    }

    await conv.save();

    // ───────────────── STREAM ─────────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let fullContent = "";

    const onChunk = (text: string) => {
      fullContent += text;
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

      // 💾 salva resposta da IA
      if (fullContent) {
        conv.messages.push({
          role: "assistant",
          content: fullContent,
          createdAt: new Date(),
        });

        conv.updatedAt = new Date();
        await conv.save();
      }

      const doneData = JSON.stringify({
        type: "done",
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        },
        conversationId: conv._id, // 👈 importante pro frontend
      });

      res.write(`data: ${doneData}\n\n`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      const errorData = JSON.stringify({ type: "error", message });
      res.write(`data: ${errorData}\n\n`);
    } finally {
      res.end();
    }
  } catch {
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────

connectDB();

export default app;