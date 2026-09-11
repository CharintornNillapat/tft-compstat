import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag }));

const SECRET = "s".repeat(32);
let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  vi.stubEnv("REVALIDATE_SECRET", SECRET);
  ({ POST } = await import("./route"));
});

beforeEach(() => revalidateTag.mockClear());

const call = (body: unknown, authorization: string | null = `Bearer ${SECRET}`) =>
  POST(
    new Request("http://localhost/api/revalidate", {
      method: "POST",
      headers: authorization ? { authorization } : {},
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("POST /api/revalidate", () => {
  it("expires each known tag once", async () => {
    const response = await call({ tags: ["tiers", "static", "tiers"] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: ["tiers", "static"] });
    expect(revalidateTag.mock.calls).toEqual([
      ["tiers", { expire: 0 }],
      ["static", { expire: 0 }],
    ]);
  });

  it("rejects a missing or wrong secret", async () => {
    expect((await call({ tags: ["tiers"] }, null)).status).toBe(401);
    expect((await call({ tags: ["tiers"] }, `Bearer ${"x".repeat(32)}`)).status).toBe(401);
    expect((await call({ tags: ["tiers"] }, SECRET)).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects unknown tags and malformed bodies", async () => {
    expect((await call({ tags: ["everything"] })).status).toBe(400);
    expect((await call({ tags: [] })).status).toBe(400);
    expect((await call("not json")).status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
