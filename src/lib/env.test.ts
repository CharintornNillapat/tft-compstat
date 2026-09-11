import { describe, expect, it } from "vitest";
import {
  readRiotEnv,
  readSecretsEnv,
  readSupabaseAdminEnv,
  readSupabasePublicEnv,
  supabaseKeyRole,
} from "./env";

const riot = {
  RIOT_API_KEY: "RGAPI-00000000-0000-0000-0000-000000000000",
  RIOT_GAME_NAME: "BurdenInMyHand",
  RIOT_TAG_LINE: "6969",
  RIOT_PLATFORM: "th2",
};

describe("readRiotEnv", () => {
  it("parses a complete Riot config", () => {
    expect(readRiotEnv(riot)).toEqual(riot);
  });

  it("names every missing variable", () => {
    expect(() => readRiotEnv({ RIOT_PLATFORM: "th2" })).toThrowError(
      /RIOT_API_KEY[\s\S]*RIOT_GAME_NAME[\s\S]*RIOT_TAG_LINE/,
    );
  });

  it("rejects an unknown platform", () => {
    expect(() => readRiotEnv({ ...riot, RIOT_PLATFORM: "moon1" })).toThrowError(/RIOT_PLATFORM/);
  });

  it("only validates its own scope", () => {
    expect(() => readRiotEnv({ ...riot, SUPABASE_SERVICE_ROLE_KEY: undefined })).not.toThrow();
  });
});

describe("readSupabasePublicEnv / readSupabaseAdminEnv", () => {
  it("requires a valid URL", () => {
    expect(() =>
      readSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "not a url", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("admin scope needs the service role key but not the anon key", () => {
    const url = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" };
    expect(() => readSupabaseAdminEnv(url)).toThrowError(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(readSupabaseAdminEnv({ ...url, SUPABASE_SERVICE_ROLE_KEY: "k" })).toMatchObject(url);
  });
});

describe("swapped Supabase keys", () => {
  const jwt = (role: string) =>
    ["e30", Buffer.from(JSON.stringify({ role })).toString("base64url"), "sig"].join(".");
  const url = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" };

  it("reads the role from legacy JWT keys and new-style keys", () => {
    expect(supabaseKeyRole(jwt("anon"))).toBe("anon");
    expect(supabaseKeyRole(jwt("service_role"))).toBe("service_role");
    expect(supabaseKeyRole("sb_publishable_abc")).toBe("anon");
    expect(supabaseKeyRole("sb_secret_abc")).toBe("service_role");
    expect(supabaseKeyRole("opaque")).toBeUndefined();
  });

  it("rejects the anon key in SUPABASE_SERVICE_ROLE_KEY", () => {
    expect(() => readSupabaseAdminEnv({ ...url, SUPABASE_SERVICE_ROLE_KEY: jwt("anon") })).toThrowError(
      /SUPABASE_SERVICE_ROLE_KEY: is the anon/,
    );
    expect(() =>
      readSupabaseAdminEnv({ ...url, SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_abc" }),
    ).toThrowError(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(readSupabaseAdminEnv({ ...url, SUPABASE_SERVICE_ROLE_KEY: jwt("service_role") })).toBeTruthy();
  });

  it("rejects a service key in the public anon variable", () => {
    expect(() =>
      readSupabasePublicEnv({ ...url, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("service_role") }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_ANON_KEY: is a service_role/);
    expect(readSupabasePublicEnv({ ...url, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon") })).toBeTruthy();
  });
});

describe("readSecretsEnv", () => {
  it("rejects short secrets without echoing their value", () => {
    const leaky = "tooShort123";
    let message = "";
    try {
      readSecretsEnv({ CRON_SECRET: leaky, REVALIDATE_SECRET: "x".repeat(32) });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/CRON_SECRET/);
    expect(message).not.toContain(leaky);
  });
});
