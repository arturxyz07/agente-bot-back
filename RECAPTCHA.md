# reCAPTCHA no cadastro e login

Use reCAPTCHA v2, caixa de seleção “Não sou um robô”. Crie as chaves em https://www.google.com/recaptcha/admin/create para os domínios do frontend.

Configure no backend (variáveis de ambiente da hospedagem):

```env
RECAPTCHA_SECRET_KEY=chave_secreta_do_google
RECAPTCHA_ALLOWED_HOSTNAMES=seu-frontend.vercel.app,seu-dominio.com.br
```

A lista contém hostnames exatos do **frontend**, sem protocolo, porta, caminho ou curinga. Inclua localhost apenas no ambiente de desenvolvimento. Não use as chaves públicas de teste em produção. Nunca publique a chave secreta no GitHub nem em variável NEXT_PUBLIC_.

No frontend, configure `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` com a chave pública do mesmo par. Faça um novo build do frontend e redeploy do backend. Configure ambos os projetos antes de implantar: sem as variáveis, novos logins e cadastros ficam bloqueados (HTTP 503 no backend). Sessões existentes continuam válidas.

As rotas POST /api/auth/login e POST /api/auth/register exigem `recaptchaToken` no JSON. A validação server-side ocorre antes de consultas de usuário e bcrypt, com timeout de 5 segundos, validação de hostname e recusa em caso de erro. Tokens são de uso único e expiram conforme o Google; após cada tentativa o frontend solicita nova verificação.

O CAPTCHA combate automação, mas não substitui rate limiting nem protege chat, upload e demais rotas contra sobrecarga. Nomes repetidos no ranking não são removidos: nomes de exibição não são únicos no modelo atual.

Validação local: `npm run build && node --test test/recaptcha.test.cjs`. O teste simula respostas do Google, sem chaves reais. A homologação final exige resolver um desafio real no domínio publicado.

Referências: https://developers.google.com/recaptcha/docs/verify e https://developers.google.com/recaptcha/docs/display
