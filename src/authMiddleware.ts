import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticação ausente." });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET || "secret";
    const payload = jwt.verify(token, secret) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado." });
  }
}