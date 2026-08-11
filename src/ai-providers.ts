import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from "@google/generative-ai";
import { AIModel, ChatMessagePayload, ImageAttachment } from "./types";
import { User } from "./db";

const adicionarXPTool: FunctionDeclaration = {
  name: "adicionarXP",
  description: "Adiciona XP ao jogador pelo nickname. Use quando o usuário acertar charadas (+50) ou pedir respostas (-10).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      nickname: { type: SchemaType.STRING, description: "O nome do usuário" },
      quantidade: { type: SchemaType.NUMBER, description: "Quantidade de XP (positiva ou negativa)" },
    },
    required: ["nickname", "quantidade"],
  },
};

async function handleToolCall(call: { name: string; args: any }) {
  if (call.name === "adicionarXP") {
    const { nickname, quantidade } = call.args;
    const user = await User.findOneAndUpdate(
      { name: nickname },
      { $inc: { xp: quantidade } },
      { new: true }
    );
    return { success: !!user, xp: user?.xp };
  }
  return { error: "Ferramenta não encontrada" };
}

export async function streamAnthropicResponse(
  model: AIModel,
  messages: ChatMessagePayload[],
  onChunk: (text: string) => void
): Promise<{ inputTokens: number; outputTokens: number }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let inputTokens = 0;
  let outputTokens = 0;

  const anthropicMessages: Anthropic.MessageParam[] = messages.map((message) => ({
    role: message.role,
    content: [
      ...(message.role === "user" ? (message.images ?? []).map((image) => ({
        type: "image" as const,
        source: { type: "url" as const, url: image.url },
      })) : []),
      { type: "text" as const, text: message.content || "Analise a imagem." },
    ],
  }));

  const stream = await client.messages.stream({
    model: model.id,
    max_tokens: 4096,
    messages: anthropicMessages,
  });

  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      onChunk(chunk.delta.text);
    }
    if (chunk.type === "message_delta" && chunk.usage) {
      outputTokens = chunk.usage.output_tokens;
    }
    if (chunk.type === "message_start" && chunk.message.usage) {
      inputTokens = chunk.message.usage.input_tokens;
    }
  }

  return { inputTokens, outputTokens };
}

export async function streamOpenAIResponse(
  model: AIModel,
  messages: ChatMessagePayload[],
  onChunk: (text: string) => void
): Promise<{ inputTokens: number; outputTokens: number }> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let inputTokens = 0;
  let outputTokens = 0;

  const openAIMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages.map((message) => {
    if (message.role === "assistant") return { role: "assistant", content: message.content };

    return {
      role: "user",
      content: [
        { type: "text", text: message.content || "Analise a imagem." },
        ...(message.images ?? []).map((image) => ({
          type: "image_url" as const,
          image_url: { url: image.url, detail: "auto" as const },
        })),
      ],
    };
  });

  const stream = await client.chat.completions.create({
    model: model.id,
    messages: openAIMessages,
    stream: true,
    stream_options: { include_usage: true },
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) onChunk(delta);
    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens;
      outputTokens = chunk.usage.completion_tokens;
    }
  }

  return { inputTokens, outputTokens };
}

export async function streamGoogleResponse(
  model: AIModel,
  messages: ChatMessagePayload[],
  onChunk: (text: string) => void
): Promise<{ inputTokens: number; outputTokens: number }> {
  const genAI = new GoogleGenerativeAI(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY!
  );
  
  const genModel = genAI.getGenerativeModel({ 
    model: model.id,
    tools: [{ functionDeclarations: [adicionarXPTool] }],
    systemInstruction: "Você é um Guardião de um cofre de conhecimento. Proponha charadas de tecnologia. Se o usuário acertar, você DEVE obrigatoriamente chamar a função 'adicionarXP' e dar a ele 50 pontos. Se o usuário pedir a resposta, chame a função e tire 10 pontos. Nunca diga os pontos que ele tem, apenas avise que ele ganhou ou perdeu XP e continue o jogo."
  });

  const history = await Promise.all(messages.slice(0, -1).map(async (m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [
      { text: m.content || "Analise a imagem." },
      ...(m.role === "user" ? await imagesToGoogleParts(m.images ?? []) : []),
    ],
  })));

  const lastMessage = messages[messages.length - 1];
  const chat = genModel.startChat({ history });
  const lastParts = [
    { text: lastMessage.content || "Analise a imagem." },
    ...await imagesToGoogleParts(lastMessage.images ?? []),
  ];
  const result = await chat.sendMessageStream(lastParts);

  let inputTokens = 0;
  let outputTokens = 0;

  for await (const chunk of result.stream) {
    try {
        const text = chunk.text();
        if (text) onChunk(text);
        
        // Lidar com chamadas de ferramenta
        const calls = chunk.functionCalls();
        if (calls && calls.length > 0) {
            for (const call of calls) {
                console.log("Executando tool call:", call.name, call.args);
                const toolResult = await handleToolCall(call);
                onChunk(`\n\n[Sistema: XP atualizado: ${JSON.stringify(toolResult)}]\n\n`);
            }
        }
    } catch (e) {
        console.error("Erro no processamento do chunk do Gemini:", e);
    }
  }

  const finalResponse = await result.response;
  const usage = finalResponse.usageMetadata;
  if (usage) {
    inputTokens = usage.promptTokenCount ?? 0;
    outputTokens = usage.candidatesTokenCount ?? 0;
  }

  return { inputTokens, outputTokens };
}

async function imagesToGoogleParts(images: ImageAttachment[]) {
  return Promise.all(images.map(async (image) => {
    const response = await fetch(image.url, { redirect: "error" });
    if (!response.ok) {
      throw new Error(`Não foi possível obter a imagem do Cloudinary (${response.status}).`);
    }

    const data = Buffer.from(await response.arrayBuffer()).toString("base64");
    return { inlineData: { data, mimeType: image.mimeType } };
  }));
}
