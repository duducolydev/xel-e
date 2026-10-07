import { z } from "zod";

// Une variable laissée vide dans le .env (« NOTIF_HTTP_URL= ») vaut absente.
const videVersAbsent = (valeur: unknown) => (valeur === "" ? undefined : valeur);

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  MAIL_FROM: z.string().min(1).default("Xel-E <no-reply@xele.sn>"),
  CLAMAV_HOST: z.string().min(1).default("127.0.0.1"),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  // WhatsApp/SMS : « mock » (développement, tests) ou « http » (passerelle configurable).
  NOTIF_PROVIDER: z.enum(["mock", "http"]).default("mock"),
  NOTIF_HTTP_URL: z.preprocess(videVersAbsent, z.string().url().optional()),
  NOTIF_HTTP_TOKEN: z.preprocess(videVersAbsent, z.string().optional()),
  // Planification des résumés (dimanche 18 h, le 1er à 18 h) ; désactivable pour un worker séparé.
  RESUMES_PLANIFIES: z
    .enum(["true", "false"])
    .default("true")
    .transform((valeur) => valeur === "true"),
  // Délai de base des nouvelles tentatives d'envoi (doublé à chaque échec).
  RESUME_BACKOFF_MS: z.coerce.number().int().positive().default(60_000),
}).refine((env) => env.NOTIF_PROVIDER !== "http" || env.NOTIF_HTTP_URL !== undefined, {
  message: "NOTIF_HTTP_URL est obligatoire quand NOTIF_PROVIDER=http.",
  path: ["NOTIF_HTTP_URL"],
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Configuration invalide : ${details}`);
  }
  return result.data;
}
