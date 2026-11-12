// Encryption for data at rest (Google refresh token, phone numbers, notes).
//
// AES-256-GCM: a strong, standard cipher that also detects tampering.
// Every value gets its own random 12-byte IV, so the same phone number
// encrypts to different text each time.
//
// Stored format: "v1.<iv>.<authTag>.<ciphertext>" (each part base64url).
// The "v1" prefix lets us change the format later without breaking old data.
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

export interface Cipher {
  encrypt(plainText: string): string;
  decrypt(payload: string): string;
}

export function createCipher(base64Key: string): Cipher {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");

  return {
    encrypt(plainText) {
      const iv = randomBytes(12);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
    },
    decrypt(payload) {
      const [version, ivText, tagText, dataText] = payload.split(".");
      if (version !== VERSION || !ivText || !tagText || dataText === undefined) {
        throw new Error("Unknown encrypted format");
      }
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivText, "base64url"));
      decipher.setAuthTag(Buffer.from(tagText, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
    },
  };
}

/** Random token for CSRF, OAuth state and PKCE. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Compare two secrets in constant time. Hashing first means the lengths always match,
 *  so the comparison time does not leak how long the real secret is. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** PKCE: the challenge is the SHA-256 of the verifier, base64url encoded. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
