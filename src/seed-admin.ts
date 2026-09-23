import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { User } from "./db";

async function main() {
  if (!process.env.MONGO_URI) throw new Error("Configure MONGO_URI antes de criar o administrador.");
  const email = (process.env.ADMIN_EMAIL || "admin@agente-bot.local").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "Admin@123456";
  if (process.env.NODE_ENV === "production" && (!process.env.ADMIN_PASSWORD || password === "Admin@123456")) {
    throw new Error("Defina uma ADMIN_PASSWORD própria em produção.");
  }
  if (password.length < 12) throw new Error("ADMIN_PASSWORD deve ter pelo menos 12 caracteres.");
  await mongoose.connect(process.env.MONGO_URI);
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== "admin") throw new Error("Email já usado por usuário comum. Escolha outro ADMIN_EMAIL; nenhuma conta foi promovida.");
    console.log("Administrador já existe; senha e dados preservados.");
    return;
  }
  await User.create({ name: "Administrador", email, password: await bcrypt.hash(password, 12), role: "admin" });
  console.log(`Administrador criado: ${email}. Acesse /admin pelo frontend.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
