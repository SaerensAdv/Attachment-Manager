import { z } from "zod";
import { logger } from "./logger";

/**
 * Boot-time environment validation.
 *
 * Required variables fail fast with a clear message (the app cannot run without
 * them). The optional Google Ads integration is shape-checked and only *warned*
 * about — a misconfigured optional secret surfaces a readable message at startup
 * instead of failing deep inside an API call, without taking the whole app down
 * when that integration simply isn't in use.
 */

const requiredSchema = z.object({
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL ontbreekt (is de database geprovisioned?)." })
    .min(1, "DATABASE_URL mag niet leeg zijn."),
  PORT: z
    .string({ required_error: "PORT ontbreekt." })
    .regex(/^\d+$/, "PORT moet een positief geheel getal zijn.")
    .refine((v) => Number(v) > 0, "PORT moet groter dan 0 zijn."),
});

export interface AppEnv {
  DATABASE_URL: string;
  PORT: number;
  NODE_ENV: string;
}

/** The five secrets the live (read-only) Google Ads intake needs together. */
const GOOGLE_ADS_KEYS = [
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_OAUTH_CLIENT_ID",
  "GOOGLE_ADS_OAUTH_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
] as const;

/**
 * Shape-check the optional Google Ads secret group. Returns a list of warnings;
 * never throws. An empty result means either "all good" or "not configured".
 */
export function checkGoogleAdsEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const value = (k: string) => (env[k] ?? "").trim();
  const present = GOOGLE_ADS_KEYS.filter((k) => value(k).length > 0);
  // Integration simply not configured — that's a valid state, no warning.
  if (present.length === 0) return [];

  const warnings: string[] = [];

  const missing = GOOGLE_ADS_KEYS.filter((k) => !value(k));
  if (missing.length > 0) {
    warnings.push(
      `Google Ads is maar gedeeltelijk geconfigureerd. Ontbrekende secrets: ${missing.join(", ")}.`,
    );
  }

  const rawLoginId = value("GOOGLE_ADS_LOGIN_CUSTOMER_ID");
  if (rawLoginId) {
    const digits = rawLoginId.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 12) {
      warnings.push(
        "GOOGLE_ADS_LOGIN_CUSTOMER_ID lijkt geen geldig account-id (verwacht 8–12 cijfers, bv. 123-456-7890).",
      );
    }
  }

  return warnings;
}

/**
 * Validate required env and warn about an optional misconfiguration. Throws on a
 * missing/invalid required variable so the process exits at boot with a clear
 * message rather than crashing on the first request.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = requiredSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Ongeldige of ontbrekende omgevingsvariabelen:\n${issues}`);
  }

  for (const warning of checkGoogleAdsEnv(env)) {
    logger.warn({ scope: "env:google-ads" }, warning);
  }

  return {
    DATABASE_URL: parsed.data.DATABASE_URL,
    PORT: Number(parsed.data.PORT),
    NODE_ENV: env.NODE_ENV ?? "development",
  };
}
