# Sprint 8 — Centro de Comando (Dashboard Analytics e Controle de Custos)

Este backend está em **TypeScript** (`src/`). A Sprint 8 pede arquivos JavaScript com
nomes exatos para a inspeção estática do professor. Para atender a rubrica **e** manter o
deploy real funcionando, os arquivos da sprint vivem na raiz em CommonJS e são carregados
pelo app real via `require`.

## Mapa da rubrica

| Requisito | Arquivo | O que faz |
|-----------|---------|-----------|
| REQ-001 (RBAC) | `models/Usuario.js` | Schema do usuário com `role: { type: String, default: "user" }`. Aponta para a coleção real `users`. |
| REQ-003 (Telemetria) | `models/Mensagem.js` | Schema com `tokensGastos: { type: Number, default: 0 }`. |
| REQ-002 (Segurança) | `middlewares/apenasAdmin.js` | Lê `req.usuario.role`; se `admin` chama `next()`, senão responde **403**. |
| — (apoio) | `middlewares/autenticarToken.js` | Verifica o JWT e preenche `req.usuario`. |
| REQ-004 (Captura) | `controllers/chatController.js` | Lê `result.response.usageMetadata.totalTokenCount` e salva em `tokensGastos`. |
| REQ-006 + REQ-005 | `routes/analyticsRoutes.js` | `router.get("/tokens", autenticarToken, apenasAdmin, ...)` com `Mensagem.aggregate([{ $group, $sum }])`. |

## Como o deploy real usa estes arquivos

- `src/index.ts` monta a rota em **`GET /api/analytics/tokens`** (`app.use("/api/analytics", analyticsRoutes)`).
- Cada mensagem do chat (`/api/chat`) é espelhada na coleção `Mensagem`. A resposta da IA
  grava `tokensGastos = tokens de entrada + saída` reportados pelo provedor.
- O modelo real `User` (`src/db.ts`) já tinha o campo `role`; `models/Usuario.js` lê os mesmos
  documentos sob outro nome de modelo para evitar conflito de registro no Mongoose.
- **Desafio Hacker:** ao chamar `@gemini` na Sala Pública, o servidor emite
  `io.emit("novoGastoDeToken", <tokens>)` (ver `src/realtime.ts`); o dashboard atualiza em tempo real.

`controllers/chatController.js` é a implementação de referência do fluxo pedido na sprint
(SDK Gemini em modo `generateContent`); o chat de produção faz a mesma captura no streaming
dentro de `src/index.ts`.

## Passo manual obrigatório

No MongoDB Atlas, altere o seu usuário de `role: "user"` para `role: "admin"` para acessar o dashboard.

## Dashboard

A tela fica no front-end em `public/dashboard.html`, servida em `/dashboard.html`.
