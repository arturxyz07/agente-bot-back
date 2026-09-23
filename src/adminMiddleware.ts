import { Request, Response, NextFunction } from "express";
import { User } from "./db";

export async function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await User.findById(req.userId).select("role");
    if (user?.role !== "admin") {
      res.status(403).json({ error: "Acesso restrito ao administrador." });
      return;
    }
    next();
  } catch {
    res.status(503).json({ error: "Não foi possível verificar a permissão." });
  }
}
