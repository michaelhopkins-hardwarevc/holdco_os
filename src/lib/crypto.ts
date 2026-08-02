import crypto from "node:crypto";

// Symmetric encryption for secrets we must store (OAuth tokens), so they are
// encrypted at rest at the application layer, not just on disk. AES-256-GCM.
// Key comes from TOKEN_ENCRYPTION_KEY (base64/hex 32 bytes, or any string which
// is hashed to 32 bytes).

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one and add it to your env (see README).",
    );
  }
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 32) return b64;
  const hex = Buffer.from(raw, "hex");
  if (hex.length === 32) return hex;
  return crypto.createHash("sha256").update(raw).digest();
}

/** Encrypt a string to a compact "iv.tag.ciphertext" token (all base64). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(".");
}

/** Reverse of encryptSecret. */
export function decryptSecret(payload: string): string {
  const [ivB, tagB, encB] = payload.split(".");
  if (!ivB || !tagB || !encB) throw new Error("Malformed encrypted secret.");
  const decipher = crypto.createDecipheriv(
    ALGO,
    key(),
    Buffer.from(ivB, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encB, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
