import crypto from "node:crypto";
import { env } from "../config/env";

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256 bits for AES-256
const DIGEST = "sha512";

/**
 * Derives a 32-byte AES key from master secret and per-template salt using PBKDF2.
 */
export function deriveKey(masterSecret: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(masterSecret, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST);
}

function getMasterSecret(): string {
  const rawKey = env.biometricEncryptionKey;
  if (!rawKey) {
    throw new Error("BIOMETRIC_ENCRYPTION_KEY environment variable is required");
  }
  return rawKey;
}

/**
 * Encrypts a numeric embedding vector using AES-256-GCM with PBKDF2 key derivation.
 * Format: `<salt_hex>:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`
 *
 * Implements encrypted-at-rest biometric template protection.
 * Raw biometric images and unencrypted embeddings are never persisted.
 */
export function encryptEmbedding(
  embedding: number[],
  masterSecretOverride?: string
): string {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Invalid embedding vector for encryption");
  }

  const masterSecret = masterSecretOverride ?? getMasterSecret();
  const salt = crypto.randomBytes(16); // 128-bit cryptographically secure random salt
  const key = deriveKey(masterSecret, salt);
  const iv = crypto.randomBytes(12); // standard 96-bit nonce for GCM

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(embedding), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${salt.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Decrypts a stored AES-256-GCM encrypted embedding string and validates integrity tag.
 * Supports both format with salt (4 parts) and legacy direct key format (3 parts).
 */
export function decryptEmbedding(
  encryptedPayload: string,
  masterSecretOverride?: string
): number[] {
  if (!encryptedPayload || typeof encryptedPayload !== "string") {
    throw new Error("Missing or invalid encrypted biometric payload");
  }

  const parts = encryptedPayload.split(":");
  const masterSecret = masterSecretOverride ?? getMasterSecret();

  let salt: Buffer;
  let iv: Buffer;
  let authTag: Buffer;
  let ciphertext: Buffer;
  let key: Buffer;

  if (parts.length === 4) {
    // Standard format: salt:iv:authTag:ciphertext
    const [saltHex, ivHex, tagHex, dataHex] = parts;
    salt = Buffer.from(saltHex, "hex");
    iv = Buffer.from(ivHex, "hex");
    authTag = Buffer.from(tagHex, "hex");
    ciphertext = Buffer.from(dataHex, "hex");

    if (salt.length !== 16 || iv.length !== 12 || authTag.length !== 16) {
      throw new Error("Invalid encryption parameters in biometric template");
    }
    key = deriveKey(masterSecret, salt);
  } else if (parts.length === 3) {
    // Legacy format: iv:authTag:ciphertext
    const [ivHex, tagHex, dataHex] = parts;
    iv = Buffer.from(ivHex, "hex");
    authTag = Buffer.from(tagHex, "hex");
    ciphertext = Buffer.from(dataHex, "hex");

    if (iv.length !== 12 || authTag.length !== 16) {
      throw new Error("Invalid encryption parameters in legacy biometric template");
    }
    if (/^[0-9a-fA-F]{64}$/.test(masterSecret)) {
      key = Buffer.from(masterSecret, "hex");
    } else {
      key = crypto.createHash("sha256").update(masterSecret).digest();
    }
  } else {
    throw new Error("Corrupt or invalid biometric template format");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const vector = JSON.parse(decrypted.toString("utf8")) as number[];
  if (!Array.isArray(vector)) {
    throw new Error("Decrypted payload is not a valid vector");
  }
  return vector;
}

/**
 * Calculates cosine similarity between two numeric vectors.
 * Returns value between -1.0 and 1.0.
 */
export function cosineSimilarity(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length || v1.length === 0) {
    return 0;
  }
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }
  if (norm1 === 0 || norm2 === 0) return 0;
  const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  return Math.min(1, Math.max(-1, similarity));
}
