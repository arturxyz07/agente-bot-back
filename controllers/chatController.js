// Sprint 8 — Controller de chat com telemetria de tokens do Gemini.
// REQ-004: captura result.response.usageMetadata.totalTokenCount e salva em tokensGastos.
//
// Esta é a implementação de referência do fluxo pedido na sprint (SDK @google/generative-ai
// em modo generateContent). No deploy real, o streaming vive em src/index.ts, que grava a
// mesma métrica (usageMetadata) na coleção Mensagem. A lógica de captura é idêntica.
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Mensagem = require("../models/Mensagem");

async function enviarMensagem(req, res) {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Informe um prompt de texto." });
    }

    // Salva a mensagem do usuário (não gasta tokens de saída).
    await Mensagem.create({ usuario: req.usuario?._id, role: "user", content: prompt, tokensGastos: 0 });

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.RAG_GEMINI_MODEL || "gemini-flash-latest" });

    const result = await model.generateContent(prompt);

    // 👉 O Gemini devolve os tokens usados aqui:
    const tokensGastos = result.response.usageMetadata.totalTokenCount;
    const resposta = result.response.text();

    // Salva a resposta da IA JUNTO com o custo em tokens.
    const mensagem = await Mensagem.create({
      usuario: req.usuario?._id,
      role: "assistant",
      content: resposta,
      tokensGastos: tokensGastos,
    });

    res.json({ resposta, tokensGastos: mensagem.tokensGastos });
  } catch (err) {
    console.error("Erro no chatController:", err);
    res.status(502).json({ error: "Não foi possível falar com a IA." });
  }
}

module.exports = { enviarMensagem };
