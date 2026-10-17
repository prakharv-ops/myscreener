import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, safeEqual, verifySession } from "@/lib/auth";

describe("session tokens", () => {
  beforeEach(() => { vi.stubEnv("APP_SECRET", "test-secret"); vi.stubEnv("APP_PASSWORD", "pw"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it("accepts a token it issued", async () => {
    expect(await verifySession(await createSession())).toBe(true);
  });

  it("rejects missing, malformed and tampered tokens", async () => {
    const t = await createSession();
    const [exp, sig] = t.split(".");
    expect(await verifySession(undefined)).toBe(false);
    expect(await verifySession("garbage")).toBe(false);
    expect(await verifySession(`${Number(exp) + 1}.${sig}`)).toBe(false); // extended expiry
    expect(await verifySession(`${exp}.${sig.slice(0, -1)}x`)).toBe(false); // altered signature
  });

  it("rejects tokens signed with another secret", async () => {
    const t = await createSession();
    vi.stubEnv("APP_SECRET", "rotated");
    expect(await verifySession(t)).toBe(false);
  });

  it("rejects expired tokens", async () => {
    const t = await createSession();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31 * 864e5);
    expect(await verifySession(t)).toBe(false);
  });
});

describe("safeEqual", () => {
  it("compares strings including different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
