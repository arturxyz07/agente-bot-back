// Sprint 8 — Centro de Comando: rotas de Analytics.
// Montado em /api/analytics pelo src/index.ts.
const { Router } = require("express");
const Mensagem = require("../models/Mensagem");
const Usuario = require("../models/Usuario");
const autenticarToken = require("../middlewares/autenticarToken");
const apenasAdmin = require("../middlewares/apenasAdmin");

const router = Router();

// REQ-006: proteção em camada dupla — autenticarToken E apenasAdmin antes do controller.
// GET /api/analytics/tokens
router.get("/tokens", autenticarToken, apenasAdmin, async (_req, res) => {
  try {
    // REQ-005: a soma acontece DENTRO do banco com Aggregation Pipeline ($group + $sum).
    // Nada de .find() + reduce no Node.
    const [resumo] = await Mensagem.aggregate([
      {
        $group: {
          _id: null,
          totalTokens: { $sum: "$tokensGastos" },
          totalMensagens: { $sum: 1 },
        },
      },
    ]);

    // Tokens gastos por dia (para o gráfico de barras/linhas do dashboard).
    const porDia = await Mensagem.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          tokens: { $sum: "$tokensGastos" },
          mensagens: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const totalUsuarios = await Usuario.countDocuments();

    res.json({
      totalTokens: resumo ? resumo.totalTokens : 0,
      totalMensagens: resumo ? resumo.totalMensagens : 0,
      totalUsuarios,
      porDia: porDia.map((d) => ({ dia: d._id, tokens: d.tokens, mensagens: d.mensagens })),
    });
  } catch (err) {
    console.error("Erro no analytics:", err);
    res.status(503).json({ error: "Não foi possível calcular as métricas." });
  }
});

module.exports = router;
