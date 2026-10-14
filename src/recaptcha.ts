import { Request, Response, NextFunction } from "express";

// Aceita "https://host/", aspas ou espaços colados por engano nas variáveis de ambiente.
export function normalizeHostname(value: string) {
  return value.trim().replace(/^["']|["']$/g, "").replace(/^[a-z]+:\/\//i, "").replace(/[/:].*$/, "").toLowerCase();
}

// Fail closed: missing configuration or verifier outages never bypass CAPTCHA.
export async function requireRecaptcha(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  const hostnames = (process.env.RECAPTCHA_ALLOWED_HOSTNAMES || "")
    .split(",").map(normalizeHostname).filter(Boolean);
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
    // Motivo sem segredos (códigos do Google e hostname do token) para diagnosticar a configuração.
    let motivo: string | null = null;
    if (result?.success !== true) {
      motivo = `google: ${result?.["error-codes"]?.join(", ") || "sem código"}`;
    } else if (typeof result.hostname !== "string" || !hostnames.includes(result.hostname.toLowerCase())) {
      motivo = `hostname "${result.hostname ?? ""}" fora de RECAPTCHA_ALLOWED_HOSTNAMES (${hostnames.join(", ")})`;
    }
    if (motivo) {
      console.warn(`reCAPTCHA recusado: ${motivo}`);
      res.status(403).json({ error: "Verificação inválida ou expirada. Resolva o reCAPTCHA novamente.", motivo });
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
