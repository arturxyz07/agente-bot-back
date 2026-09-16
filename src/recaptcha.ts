import { Request, Response, NextFunction } from "express";

// Fail closed: missing configuration or verifier outages never bypass CAPTCHA.
export async function requireRecaptcha(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  const hostnames = (process.env.RECAPTCHA_ALLOWED_HOSTNAMES || "")
    .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (!secret || !hostnames.length) {
    res.status(503).json({ error: "Verificação de segurança indisponível. Tente novamente mais tarde." });
    return;
  }

  const token: unknown = req.body?.recaptchaToken;
  if (typeof token !== "string" || !token.trim() || token.length > 8192) {
    res.status(400).json({ error: "Conclua a verificação de segurança." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Verifier unavailable");
    const result = await response.json() as {
      success?: boolean; hostname?: string; "error-codes"?: string[];
    } | null;
    if (result?.["error-codes"]?.some((code) => ["missing-input-secret", "invalid-input-secret"].includes(code))) {
      throw new Error("Verifier misconfigured");
    }
    if (result?.success !== true || typeof result.hostname !== "string" ||
        !hostnames.includes(result.hostname.toLowerCase())) {
      res.status(403).json({ error: "Verificação inválida ou expirada. Resolva o reCAPTCHA novamente." });
      return;
    }
  } catch {
    res.status(503).json({ error: "Não foi possível verificar o reCAPTCHA. Tente novamente." });
    return;
  } finally {
    clearTimeout(timeout);
  }
  next();
}
