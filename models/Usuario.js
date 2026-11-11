// Sprint 8 — Modelo de Usuário com RBAC (Role-Based Access Control).
// REQ-001: o campo `role` define a permissão. Padrão "user"; admins têm "admin".
//
// Observação de arquitetura: o backend real está em TypeScript (src/db.ts, modelo
// "User"). Este arquivo registra o MESMO documento sob o nome de modelo "Usuario"
// apontando para a coleção "users", para que o pipeline de analytics (que roda em
// CommonJS) leia os usuários reais sem conflito de registro de modelo no Mongoose.
const mongoose = require("mongoose");

const UsuarioSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
});

// `mongoose.models.Usuario ||` evita OverwriteModelError se o arquivo for carregado
// mais de uma vez. O terceiro argumento força a coleção "users" (a do modelo real).
module.exports =
  mongoose.models.Usuario || mongoose.model("Usuario", UsuarioSchema, "users");
