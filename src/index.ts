import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import cloudinary from "./cloudinary";

import { connectDB, User, Conversation } from "./db";
import { AI_MODELS, getModelById, checkModelAvailability } from "./models";
import {
  streamAnthropicResponse,
  streamGoogleResponse,
  streamOpenAIResponse,
} from "./ai-providers";
import { authMiddleware } from "./authMiddleware";
import { ChatRequest, AuthRequest, ImageAttachment } from "./types";

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "secret";
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGES_PER_MESSAGE = 10;
const MAX_IMAGES_PER_REQUEST = 20;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

app.use(cors());
app.use(express.json());

// 1. Analisa a intenção do usuário usando um modelo rápido
async function extractWeatherLocation(prompt: string): Promise<string | null> {
  try {
    // É recomendado criar uma variável GEMINI_API_KEY no seu .env
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY; 
    if (!apiKey) return null;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // No Gemini, o "System Prompt" fica em systemInstruction
        systemInstruction: {
          parts: [
            {
              text: "Você é um classificador de intenções. Se o usuário estiver perguntando sobre o clima/tempo de uma cidade, retorne APENAS o nome da cidade. Se não houver uma cidade especificada ou o assunto não for clima, retorne exatamente a palavra 'NAO'."
            }
          ]
        },
        // O array de mensagens fica em contents
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        // Parâmetros de geração ficam em generationConfig
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 20 // Equivalente ao max_tokens da OpenAI
        }
      })
    });

    // Tipando o retorno da API do Gemini
    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    // Extraindo o texto da resposta
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (result && result !== "NAO" && result !== "NO") {
      return result;
    }
  } catch (error) {
    console.error("Erro no interceptador de clima:", error);
  }
  return null;
}

// 2. Busca os dados reais na OpenWeatherMap
async function fetchWeather(city: string): Promise<string | null> {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) return null;

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=pt_br`;
    const res = await fetch(url);
    
    // CORREÇÃO AQUI: Tipando o retorno da OpenWeather
    const data = (await res.json()) as {
      cod: number | string;
      weather: Array<{ description: string }>;
      main: { temp: number; feels_like: number; humidity: number };
    };

    // A API retorna cod 200 (numero) se deu certo
    if (Number(data.cod) === 200) {
      return `Condição: ${data.weather[0].description}. Temperatura: ${data.main.temp}°C. Sensação térmica: ${data.main.feels_like}°C. Umidade: ${data.main.humidity}%.`;
    }
  } catch (error) {
    console.error("Erro na API OpenWeather:", error);
  }
  return null;
}

app.post(
  "/api/uploads/signature",
  authMiddleware,
  async (req: Request, res: Response) => {
    const timestamp = Math.round(Date.now() / 1000);

    const folder = `agente-bot/${req.userId}`;

    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        folder,
        allowed_formats: "jpg,jpeg,png,webp,gif",
      },
      process.env.CLOUDINARY_API_SECRET!
    );

    res.json({
      timestamp,
      signature,
      folder,
      allowedFormats: ["jpg", "jpeg", "png", "webp", "gif"],
      uploadParams: {
        timestamp,
        folder,
        allowed_formats: "jpg,jpeg,png,webp,gif",
      },
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
    });
  }
);

async function validateImages(
  images: ImageAttachment[] | undefined,
  userId: string
): Promise<ImageAttachment[]> {
  if (!images?.length) return [];
  if (images.length > MAX_IMAGES_PER_MESSAGE) {
    throw new Error(`Cada mensagem aceita no máximo ${MAX_IMAGES_PER_MESSAGE} imagens.`);
  }

  const expectedPrefix = `agente-bot/${userId}/`;
  return Promise.all(images.map(async ({ publicId }) => {
    if (!publicId || !publicId.startsWith(expectedPrefix)) {
      throw new Error("Imagem não pertence ao usuário autenticado.");
    }

    const resource = await cloudinary.api.resource(publicId, { resource_type: "image", type: "upload" });
    const mimeType = `image/${resource.format === "jpg" ? "jpeg" : resource.format}`;
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) throw new Error(`Formato de imagem não permitido: ${mimeType}.`);
    if (!resource.secure_url?.startsWith("https://res.cloudinary.com/")) throw new Error("URL segura do Cloudinary inválida.");
    if (typeof resource.bytes === "number" && resource.bytes > MAX_IMAGE_BYTES) {
      throw new Error(`A imagem excede o limite de ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
    }

    return {
      publicId: resource.public_id,
      url: resource.secure_url,
      mimeType,
      width: resource.width,
      height: resource.height,
      bytes: resource.bytes,
    };
  }));
}


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

// GET /api/ranking — lista top 10 jogadores
app.get("/api/ranking", async (_req: Request, res: Response) => {
  try {
    const topPlayers = await User.find()
      .sort({ xp: -1 })
      .limit(10)
      .select("name xp level");
    res.json({ ranking: topPlayers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar ranking." });
  }
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

    // Guardamos o conteúdo original que o usuário digitou
    const userMessage = messages[messages.length - 1];
    const originalContent = userMessage.content;

    try {
      const imageCount = messages.reduce((total, message) => total + (message.images?.length ?? 0), 0);
      if (imageCount > MAX_IMAGES_PER_REQUEST) {
        throw new Error(`A requisição aceita no máximo ${MAX_IMAGES_PER_REQUEST} imagens.`);
      }
      await Promise.all(messages.map(async (message) => {
        message.images = message.role === "user"
          ? await validateImages(message.images, req.userId!)
          : [];
      }));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Imagem inválida." });
      return;
    }

    // ======================================================================
    // 🌤️ INTERCEPTAÇÃO DE CLIMA (Executa antes de enviar para o LLM principal)
    // ======================================================================
    const city = await extractWeatherLocation(originalContent);
    let systemContext = "";
    
    if (city) {
      const weatherData = await fetchWeather(city);
      if (weatherData) {
        // Formata uma instrução silenciosa para a IA principal ler
        systemContext = `\n\n[INSTRUÇÃO INTERNA: O sistema buscou na API o clima atual em ${city}. Os dados são: ${weatherData}. Use esses dados para responder o usuário de forma natural.]`;
      }
    }
    // ======================================================================

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
        title: originalContent.slice(0, 50),
        messages: [],
      });
    }

    // 💾 SALVA A MENSAGEM ORIGINAL no banco de dados (SEM os dados do sistema)
    // Isso garante que no Front-end o usuário não veja o texto "[INSTRUÇÃO INTERNA...]"
    conv.messages.push({
      role: "user",
      content: originalContent,
      images: userMessage.images,
      createdAt: new Date(),
    });

    if (conv.messages.length === 1 && conv.title === "Nova conversa") {
      conv.title = originalContent.slice(0, 50);
    }

    await conv.save();

    // 💉 INJETA os dados do clima (se houver) no array em memória que vai ser processado pela IA.
    if (systemContext) {
      messages[messages.length - 1].content = originalContent + systemContext;
    }

    // ───────────────── STREAM (A partir daqui não muda nada) ─────────────────
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
        conversationId: conv._id,
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
