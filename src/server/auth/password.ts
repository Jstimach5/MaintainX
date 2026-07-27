import crypto from "crypto";

/**
 * Password hashing with Node's built-in scrypt.
 *
 * Stored format: scrypt$N$r$p$<salt-hex>$<hash-hex>
 * Parameters are encoded per-hash so they can be raised later without
 * breaking existing hashes. `maxmem` is set explicitly because Node's 32 MiB
 * default rejects N > 16384 at r=8 — a silent landmine for future bumps.
 */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const MAXMEM = 256 * 1024 * 1024;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  opts: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      keylen,
      { N: opts.N, r: opts.r, p: opts.p, maxmem: MAXMEM },
      (err, derivedKey) => (err ? reject(err) : resolve(derivedKey)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("hex"),
    hash.toString("hex"),
  ].join("$");
}

/**
 * Constant-time verification. Returns false (never throws) on malformed
 * stored hashes so a corrupted row degrades to "wrong password", not a 500.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return false;
    const salt = Buffer.from(parts[4], "hex");
    const expected = Buffer.from(parts[5], "hex");
    if (salt.length === 0 || expected.length === 0) return false;
    const actual = await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
    });
    // timingSafeEqual throws on length mismatch; lengths match by
    // construction here (we derive exactly expected.length bytes).
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
