// Sprint 8 — Middleware de RBAC.
// REQ-002: só deixa passar quem tem req.usuario.role === "admin".
// Caso contrário, bloqueia com HTTP 403 (Forbidden). Usar sempre DEPOIS de
// autenticarToken, que é quem preenche req.usuario a partir do JWT.
function apenasAdmin(req, res, next) {
  if (req.usuario && req.usuario.role === "admin") {
    next();
  } else {
    res.status(403).json({ error: "Acesso restrito ao administrador." });
  }
}

module.exports = apenasAdmin;
