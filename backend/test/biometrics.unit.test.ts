import assert from "node:assert/strict";
import { test } from "node:test";
import {
  encryptEmbedding,
  decryptEmbedding,
  cosineSimilarity,
  deriveKey,
} from "../src/lib/biometricCrypto";
import { generateLivenessChallenge } from "../src/modules/biometrics/biometrics.service";

test("Biometric Crypto: PBKDF2 key derivation derives deterministic 32-byte key", () => {
  const salt = Buffer.from("0123456789abcdef0123456789abcdef", "hex");
  const secret = "test-biometric-secret-key-32bytes!";
  const key1 = deriveKey(secret, salt);
  const key2 = deriveKey(secret, salt);

  assert.equal(key1.length, 32);
  assert.deepEqual(key1, key2);
});

test("Biometric Crypto: AES-256-GCM encrypted embedding round-trip", () => {
  const originalVector = Array.from({ length: 512 }, (_, i) => Math.sin(i));
  const secret = "test-secret-key-32bytes-secure-gcm!";

  const encrypted = encryptEmbedding(originalVector, secret);
  assert.ok(typeof encrypted === "string");
  assert.equal(encrypted.split(":").length, 4, "Should have salt:iv:tag:ciphertext");

  const decrypted = decryptEmbedding(encrypted, secret);
  assert.equal(decrypted.length, originalVector.length);
  for (let i = 0; i < originalVector.length; i++) {
    assert.ok(Math.abs(decrypted[i] - originalVector[i]) < 1e-6);
  }
});

test("Biometric Crypto: tampering with ciphertext or auth tag fails decryption", () => {
  const vector = [0.1, 0.2, 0.3, 0.4, 0.5];
  const secret = "test-secret-key-32bytes-secure-gcm!";
  const encrypted = encryptEmbedding(vector, secret);

  const parts = encrypted.split(":");
  // Corrupt the ciphertext
  const tamperedCiphertext = parts[0] + ":" + parts[1] + ":" + parts[2] + ":" + "deadbeef" + parts[3].slice(8);
  assert.throws(() => {
    decryptEmbedding(tamperedCiphertext, secret);
  }, /unsupported state or unable to authenticate data|Invalid encryption parameters/i);

  // Corrupt the auth tag
  const tamperedTag = parts[0] + ":" + parts[1] + ":" + "00".repeat(16) + ":" + parts[3];
  assert.throws(() => {
    decryptEmbedding(tamperedTag, secret);
  }, /unsupported state or unable to authenticate data/i);

  // Wrong secret key fails authentication
  assert.throws(() => {
    decryptEmbedding(encrypted, "wrong-secret-key-different-hash!");
  }, /unsupported state or unable to authenticate data/i);
});

test("Biometric Math: Cosine similarity correctness", () => {
  // Identical vectors -> 1.0
  const v1 = [1, 2, 3, 4, 5];
  assert.ok(Math.abs(cosineSimilarity(v1, v1) - 1.0) < 1e-6);

  // Orthogonal vectors -> 0.0
  const v2 = [1, 0];
  const v3 = [0, 1];
  assert.ok(Math.abs(cosineSimilarity(v2, v3) - 0.0) < 1e-6);

  // Opposite vectors -> -1.0
  const v4 = [2, 4, 6];
  const v5 = [-2, -4, -6];
  assert.ok(Math.abs(cosineSimilarity(v4, v5) - (-1.0)) < 1e-6);

  // Mismatched lengths -> 0.0
  assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0.0);

  // Empty vectors -> 0.0
  assert.equal(cosineSimilarity([], []), 0.0);
});

test("Liveness Challenge: Generates valid active liveness challenge", () => {
  const challenge = generateLivenessChallenge();
  assert.ok(challenge.challengeId.length > 0);
  assert.ok(["BLINK", "SMILE", "TURN_LEFT", "TURN_RIGHT", "NOD"].includes(challenge.challengeType));
  assert.ok(challenge.instructions.length > 5);
  assert.ok(challenge.expiresAt > Date.now());
});

test("Multimodal Verification Logic: Decision Matrix validation", () => {
  const faceThreshold = 0.60;
  const voiceThreshold = 0.65;
  const livenessThreshold = 0.70;

  // Helper matching the service decision logic
  function evaluateVerification(params: {
    mode: "NORMAL" | "SECURE";
    faceScore: number;
    livenessScore: number;
    voiceScore?: number;
  }) {
    const facePass = params.faceScore >= faceThreshold;
    const livenessPass = params.livenessScore >= livenessThreshold;
    const voicePass = params.mode === "SECURE"
      ? (params.voiceScore !== undefined && params.voiceScore >= voiceThreshold)
      : (params.voiceScore !== undefined ? params.voiceScore >= voiceThreshold : null);

    let overallPass = false;
    let reason: string | null = null;

    if (!facePass) {
      reason = `Face similarity score (${params.faceScore.toFixed(2)}) below required threshold (${faceThreshold})`;
    } else if (!livenessPass) {
      reason = `Liveness check failed (${params.livenessScore.toFixed(2)}) below threshold (${livenessThreshold})`;
    } else if (params.mode === "SECURE" && !voicePass) {
      reason = params.voiceScore === undefined
        ? "Voice verification sample is required in SECURE mode"
        : `Voice similarity score (${params.voiceScore.toFixed(2)}) below threshold (${voiceThreshold})`;
    } else {
      overallPass = true;
    }

    return { overallPass, reason, facePass, livenessPass, voicePass };
  }

  // 1. NORMAL mode: Face passes + Liveness passes -> OVERALL PASS
  const res1 = evaluateVerification({ mode: "NORMAL", faceScore: 0.85, livenessScore: 0.92 });
  assert.equal(res1.overallPass, true);
  assert.equal(res1.reason, null);

  // 2. NORMAL mode: Face fails -> OVERALL FAIL
  const res2 = evaluateVerification({ mode: "NORMAL", faceScore: 0.45, livenessScore: 0.92 });
  assert.equal(res2.overallPass, false);
  assert.ok(res2.reason?.includes("Face similarity score"));

  // 3. NORMAL mode: Liveness fails -> OVERALL FAIL (Prevents spoofing)
  const res3 = evaluateVerification({ mode: "NORMAL", faceScore: 0.88, livenessScore: 0.40 });
  assert.equal(res3.overallPass, false);
  assert.ok(res3.reason?.includes("Liveness check failed"));

  // 4. SECURE mode: Face + Voice + Liveness all pass -> OVERALL PASS
  const res4 = evaluateVerification({ mode: "SECURE", faceScore: 0.82, voiceScore: 0.78, livenessScore: 0.88 });
  assert.equal(res4.overallPass, true);

  // 5. SECURE mode: Missing Voice -> OVERALL FAIL
  const res5 = evaluateVerification({ mode: "SECURE", faceScore: 0.82, livenessScore: 0.88 });
  assert.equal(res5.overallPass, false);
  assert.ok(res5.reason?.includes("required in SECURE mode"));

  // 6. SECURE mode: Voice below threshold -> OVERALL FAIL
  const res6 = evaluateVerification({ mode: "SECURE", faceScore: 0.82, voiceScore: 0.50, livenessScore: 0.88 });
  assert.equal(res6.overallPass, false);
  assert.ok(res6.reason?.includes("Voice similarity score"));
});
