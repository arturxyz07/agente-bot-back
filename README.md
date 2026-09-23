# Agente Bot — Backend

API Express/TypeScript com MongoDB, autenticação JWT e painel de análise documental no frontend.

## Executar localmente

Use Node.js 22.13 ou superior e MongoDB.

1. Execute `npm install`.
2. Copie `.env.example` para `.env` e configure `MONGO_URI`, uma `JWT_SECRET` privada e `GOOGLE_GENERATIVE_AI_API_KEY`.
3. Configure o reCAPTCHA conforme [RECAPTCHA.md](RECAPTCHA.md). O login do admin usa a mesma verificação dos demais usuários.
4. Execute `npm run seed:admin` para criar o administrador inicial.
5. Execute `npm run dev` (porta 3001). Para produção: `npm run build` e `npm start`.

## Administrador padrão — acesso explícito

| Campo | Valor de desenvolvimento |
| --- | --- |
| Nome | Administrador |
| Email | `admin@agente-bot.local` |
| Senha | `Admin@123456` |
| Painel | `http://localhost:3000/admin` |

A conta é criada pelo comando **`npm run seed:admin`**, não pelo cadastro público. Faça login com email, senha e reCAPTCHA no frontend. O menu **Painel admin · Documentos** aparece para administradores.

`ADMIN_EMAIL` e `ADMIN_PASSWORD` substituem os valores padrão. Em produção, configure `NODE_ENV=production` e uma senha própria de pelo menos 12 caracteres antes de rodar o seed; a senha padrão é recusada. A execução repetida não altera a senha de um admin existente. Se o email já pertencer a um usuário comum, o seed falha sem promover a conta; escolha outro email. Usuários antigos sem `role` continuam sendo usuários comuns. O cadastro público não aceita atribuição de papel administrativo.

`JWT_SECRET` é obrigatória: a antiga chave de fallback `secret` foi removida. Caso a instalação usasse esse fallback, configure uma chave privada e faça login novamente.

## Fluxo documental

O admin envia um PDF ou TXT, o backend extrai todo o texto e o armazena no MongoDB. A cada pergunta, o backend recupera o documento selecionado e envia seu conteúdo integral ao Gemini junto com a pergunta. O texto completo não é retornado na listagem, nem incluído no histórico do chat. A resposta inclui o nome e ID da fonte.

A instrução de sistema é: **“Você é um analista. Responda à pergunta do usuário baseando-se ÚNICA E EXCLUSIVAMENTE neste documento.”** O modelo também recebe instruções para recusar perguntas sem evidência e citar pequenos trechos. Esse fluxo não usa as ferramentas de XP, clima ou histórico do chat comum.

Esta implementação faz recuperação por ID e contexto integral, como solicitado; não usa embeddings ou busca vetorial. O prompt reduz respostas fora da fonte, mas não garante ausência de alucinações ou de prompt injection. Verifique as citações antes de usar a resposta em decisões. O conteúdo é enviado à API do Google somente ao consultar o documento.

## Rotas protegidas

### Frontend em outro domínio (CORS)

Configure `CORS_ALLOWED_ORIGINS=https://agente-bot-phi.vercel.app,http://localhost:3000` no backend. Esses são também os valores padrão. Use origens completas, com protocolo, separadas por vírgula. O middleware responde ao preflight `OPTIONS` antes da autenticação e inclui CORS nas respostas de erro. `RECAPTCHA_ALLOWED_HOSTNAMES` é outra configuração: nela use somente o hostname, por exemplo `agente-bot-phi.vercel.app`, sem protocolo.

O leitor de PDF e `@napi-rs/canvas` são carregados somente ao enviar PDFs. A dependência nativa é importada explicitamente para inclusão no pacote serverless. Uma falha nesse leitor não impede a inicialização da API ou o login. Instale as dependências opcionais de plataforma no build (não use `--omit=optional`) e faça novo deploy após atualizar o lockfile.

Todas exigem `Authorization: Bearer <token>` e papel `admin`, consultado no banco a cada requisição. Usuários comuns recebem 403; sem token válido, 401. Todos os admins compartilham a base documental.

| Método | Rota | Entrada / saída |
| --- | --- | --- |
| GET | `/api/admin/documents` | `{ documents: [{ _id, name, bytes, characters, createdAt }] }` |
| POST | `/api/admin/documents` | `multipart/form-data`, um arquivo no campo `file`; retorna `{ document }` com metadados |
| DELETE | `/api/admin/documents/:id` | Exclui texto e metadados; retorna `{ deleted: true }` |
| POST | `/api/admin/documents/:id/ask` | JSON `{ "question": "Qual o prazo?" }`; retorna `{ answer, document: { _id, name } }` |

Limites: 4 MiB por arquivo, 200.000 caracteres extraídos e 4.000 caracteres por pergunta. Documentos grandes são rejeitados, nunca truncados silenciosamente. TXT exige UTF-8. PDFs corrompidos, protegidos ou sem texto extraível são rejeitados; não há OCR de imagens. Arquivos originais não são persistidos. Configure limites de infraestrutura e tempo de execução compatíveis com a extração e a chamada de até 60 segundos ao Gemini. `RAG_GEMINI_MODEL` permite selecionar o modelo disponível na sua conta Google.

## Validação

`npm test` compila e executa testes de autenticação/autorização, upload, extração, consulta e isolamento do contexto com serviços externos simulados. O uso real exige MongoDB, reCAPTCHA e chave Google válidos.
