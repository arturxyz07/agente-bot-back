import cors from "cors";

export function createCorsMiddleware() {
  const origins = (process.env.CORS_ALLOWED_ORIGINS || "https://agente-bot-phi.vercel.app,http://localhost:3000")
    .split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean);
  return cors({
    origin: origins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  });
}
