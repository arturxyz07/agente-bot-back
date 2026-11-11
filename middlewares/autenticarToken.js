// Sprint 8 — Autenticação por JWT para o pipeline de analytics (CommonJS).
// Verifica o token "Bearer", carrega o usuário real e expõe req.usuario (com role),
// que o middleware apenasAdmin usa em seguida. Mesmo JWT_SECRET do backend principal.
const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");

async function autenticarToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de autenticação ausente." });
  }

  const token = authHeader.split(" ")[1];
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET não configurada.");
    const payload = jwt.verify(token, secret); // { userId }
    const usuario = await Usuario.findById(payload.userId).select("name email role");
    if (!usuario) return res.status(401).json({ error: "Usuário não encontrado." });
    req.usuario = usuario; // usado por apenasAdmin
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

module.exports = autenticarToken;
