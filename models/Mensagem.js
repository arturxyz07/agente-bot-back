// Sprint 8 — Modelo de Mensagem com telemetria de tokens.
// REQ-003: cada mensagem guarda quantos tokens a IA gastou para produzi-la.
// Esta coleção ("mensagens") é alimentada pelo chat real (src/index.ts grava aqui
// em paralelo às conversas) e é a fonte do pipeline de analytics.
const mongoose = require("mongoose");

const MensagemSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, default: "" },
  // Tokens = dinheiro em Cloud. 0 para mensagens do usuário; totalTokenCount na resposta da IA.
  tokensGastos: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

module.exports =
  mongoose.models.Mensagem || mongoose.model("Mensagem", MensagemSchema);
