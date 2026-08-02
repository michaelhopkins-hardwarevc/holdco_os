// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

describe("token encryption", () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "test-key-for-vitest-only";
  });

  it("round-trips a secret and hides the plaintext", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
    const secret = "refresh-token-abc.123-XYZ";
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);
    expect(enc.split(".")).toHaveLength(3);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("produces different ciphertext each time (random IV)", async () => {
    const { encryptSecret } = await import("@/lib/crypto");
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });
});
