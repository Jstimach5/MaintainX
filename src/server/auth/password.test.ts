import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing (scrypt)", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(
      true,
    );
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces unique salts (different hashes for same password)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
  });

  it("encodes parameters in the stored format", async () => {
    const hash = await hashPassword("x");
    const parts = hash.split("$");
    expect(parts[0]).toBe("scrypt");
    expect(Number(parts[1])).toBeGreaterThan(0); // N
    expect(parts).toHaveLength(6);
  });

  it("returns false (not throw) on malformed stored hashes", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
    expect(await verifyPassword("x", "scrypt$bad$8$1$aa$bb")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$16384$8$1$aa$bb")).toBe(false);
    // Truncated hash (odd salt, empty hash parts)
    expect(await verifyPassword("x", "scrypt$16384$8$1$$")).toBe(false);
  });

  it("verifies hashes with different (older/newer) parameters", async () => {
    // Simulate a hash produced with smaller params: N=4096.
    const crypto = await import("crypto");
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync("pw", salt, 64, { N: 4096, r: 8, p: 1 });
    const stored = `scrypt$4096$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
    expect(await verifyPassword("pw", stored)).toBe(true);
    expect(await verifyPassword("nope", stored)).toBe(false);
  });
});
