import { z } from "zod";

/**
 * Environment access, validated lazily per concern so each consumer only
 * requires the variables it uses (e.g. seed scripts don't need RIOT_API_KEY).
 * Server-side only: reads `process.env` as a whole.
 *
 * `read*Env(source)` are pure (used by tests); the `*Env()` getters validate
 * `process.env` once and memoize.
 */

type EnvSource = Record<string, string | undefined>;

export const RIOT_PLATFORMS = [
  "br1", "eun1", "euw1", "jp1", "kr", "la1", "la2", "me1", "na1",
  "oc1", "ph2", "ru", "sg2", "th2", "tr1", "tw2", "vn2",
] as const;

export type RiotPlatform = (typeof RIOT_PLATFORMS)[number];

const secret = z.string().min(16, "must be at least 16 characters");

/**
 * Role a Supabase API key grants: the `role` claim of a legacy JWT key, or the
 * equivalent for new-style `sb_publishable_` / `sb_secret_` keys. Undefined if unknown.
 */
export function supabaseKeyRole(key: string): string | undefined {
  if (key.startsWith("sb_publishable_")) return "anon";
  if (key.startsWith("sb_secret_")) return "service_role";
  const payload = key.split(".")[1];
  if (!payload) return undefined;
  try {
    const { role } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof role === "string" ? role : undefined;
  } catch {
    return undefined;
  }
}

// Swapped keys fail loudly here instead of as RLS errors (or a leaked service key) later.
const supabasePublicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1)
    .refine((key) => supabaseKeyRole(key) !== "service_role", {
      message: "is a service_role/secret key; use the anon (publishable) key",
    }),
});

const supabaseAdminSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1)
    .refine((key) => supabaseKeyRole(key) !== "anon", {
      message: "is the anon (publishable) key; use the service_role (secret) key",
    }),
});

const riotSchema = z.object({
  RIOT_API_KEY: z.string().min(1),
  RIOT_GAME_NAME: z.string().min(1),
  RIOT_TAG_LINE: z.string().min(1),
  RIOT_PLATFORM: z.enum(RIOT_PLATFORMS),
});

const secretsSchema = z.object({
  CRON_SECRET: secret,
  REVALIDATE_SECRET: secret,
});

const revalidateSchema = z.object({
  REVALIDATE_SECRET: secret,
  // Site the seed scripts revalidate after writing. Optional, local only; empty = skip.
  SITE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
});

function parseEnv<T extends z.ZodType>(scope: string, schema: T, source: EnvSource): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Issue messages never include the received value, so secrets can't leak into logs.
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid ${scope} environment variables:\n${details}\nSee .env.example.`);
  }
  return result.data;
}

export const readSupabasePublicEnv = (source: EnvSource) =>
  parseEnv("Supabase (public)", supabasePublicSchema, source);
export const readSupabaseAdminEnv = (source: EnvSource) =>
  parseEnv("Supabase (admin)", supabaseAdminSchema, source);
export const readRiotEnv = (source: EnvSource) => parseEnv("Riot", riotSchema, source);
export const readSecretsEnv = (source: EnvSource) => parseEnv("secrets", secretsSchema, source);
export const readRevalidateEnv = (source: EnvSource) =>
  parseEnv("revalidation", revalidateSchema, source);

function memoize<T>(read: () => T): () => T {
  let value: { current: T } | undefined;
  return () => (value ??= { current: read() }).current;
}

export const supabasePublicEnv = memoize(() => readSupabasePublicEnv(process.env));
export const supabaseAdminEnv = memoize(() => readSupabaseAdminEnv(process.env));
export const riotEnv = memoize(() => readRiotEnv(process.env));
export const secretsEnv = memoize(() => readSecretsEnv(process.env));
export const revalidateEnv = memoize(() => readRevalidateEnv(process.env));
