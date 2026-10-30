import "server-only";
import { z } from "zod";

/**
 * Validated server configuration. Fails fast with a descriptive message listing every missing or
 * invalid variable. Nothing here is ever exposed to the browser (no NEXT_PUBLIC_ secrets).
 */
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    APP_URL: z.url("APP_URL must be the public origin, e.g. https://veilprocure.example"),
    DATABASE_URL: z.string().startsWith("postgres", "DATABASE_URL must be a postgres:// URL"),
    VEIL_MASTER_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "VEIL_MASTER_KEY must be 32 random bytes, base64"),
    VEIL_KEY_ID: z.string().min(1).default("local-1"),
    DOWNLOAD_TOKEN_SECRET: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length >= 32, "DOWNLOAD_TOKEN_SECRET must be ≥ 32 random bytes, base64"),
    STORAGE_DIR: z.string().min(1),
    EMAIL_TRANSPORT: z.enum(["smtp", "resend", "dev-mailbox", "disabled"]).default("disabled"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    SUPPORT_EMAIL: z.string().email().optional().or(z.literal("")),
    NEAR_NETWORK: z.literal("testnet", "VeilProcure only supports NEAR testnet in this release"),
    NEAR_RPC_URL: z.url(),
    NEAR_EXPLORER_URL: z.url(),
    NEAR_CONTRACT_ID: z.string().default(""),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(24 * 7),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_TRANSPORT === "resend" && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) {
      ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "EMAIL_TRANSPORT=resend requires RESEND_API_KEY and EMAIL_FROM" });
    }
    if (env.EMAIL_TRANSPORT === "smtp" && (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.EMAIL_FROM)) {
      ctx.addIssue({ code: "custom", path: ["SMTP_PASS"], message: "EMAIL_TRANSPORT=smtp requires SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM" });
    }
    if (env.NODE_ENV === "production" && env.EMAIL_TRANSPORT !== "smtp" && env.EMAIL_TRANSPORT !== "resend") {
      ctx.addIssue({ code: "custom", path: ["EMAIL_TRANSPORT"], message: "production must deliver sign-in e-mails: use smtp or resend (dev-mailbox and disabled are not allowed)" });
    }
    if (env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_VEIL_E2E_WALLET === "1") {
      ctx.addIssue({ code: "custom", path: ["NEXT_PUBLIC_VEIL_E2E_WALLET"], message: "the end-to-end test wallet bridge must never be enabled in production" });
    }
    if (env.NODE_ENV === "production" && !env.APP_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "APP_URL must use https in production" });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`VeilProcure server configuration is invalid:\n${problems}\nSee .env.example and README "Configuration".`);
  }
  cached = parsed.data;
  return cached;
}

export function contractConfigured(): boolean {
  return env().NEAR_CONTRACT_ID.length > 0;
}

export function explorerTxUrl(txHash: string): string {
  return `${env().NEAR_EXPLORER_URL}/txns/${encodeURIComponent(txHash)}`;
}

export function explorerAccountUrl(accountId: string): string {
  return `${env().NEAR_EXPLORER_URL}/address/${encodeURIComponent(accountId)}`;
}
