import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIModel } from "./types";

export async function streamAnthropicResponse(
  model: AIModel,
  messages: { role: "user" | "assistant"; content: string }[],
  onChunk: (text: string) => void
): Promise<{ inputTokens: number; outputTokens: number }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let inputTokens = 0;
  let outputTokens = 0;

  const stream = await client.messages.stream({
    model: model.id,
    max_tokens: 4096,
    messages,
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
  messages: { role: "user" | "assistant"; content: string }[],
  onChunk: (text: string) => void
): Promise<{ inputTokens: number; outputTokens: number }> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let inputTokens = 0;
  let outputTokens = 0;

  const stream = await client.chat.completions.create({
    model: model.id,
    messages,
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
  messages: { role: "user" | "assistant"; content: string }[],
  onChunk: (text: string) => void
): Promise<{ inputTokens: number; outputTokens: number }> {
  const genAI = new GoogleGenerativeAI(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY!
  );
  const genModel = genAI.getGenerativeModel({ model: model.id });

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const lastMessage = messages[messages.length - 1];
  const chat = genModel.startChat({ history });
  const result = await chat.sendMessageStream(lastMessage.content);

  let inputTokens = 0;
  let outputTokens = 0;

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) onChunk(text);
  }

  const finalResponse = await result.response;
  const usage = finalResponse.usageMetadata;
  if (usage) {
    inputTokens = usage.promptTokenCount ?? 0;
    outputTokens = usage.candidatesTokenCount ?? 0;
  }

  return { inputTokens, outputTokens };
}