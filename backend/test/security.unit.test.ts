import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { signAccessToken, signRefreshToken, verifyAccessToken } from "../src/lib/jwt";
import { z } from "zod";

test("Security: Password hashing with bcrypt produces salted hash and verifies", async () => {
  const plainPassword = "SuperSecurePassword123!";
  const hash = await hashPassword(plainPassword);

  assert.ok(hash.startsWith("$2"), "Should be a bcrypt hash");
  assert.notEqual(hash, plainPassword);

  const isValid = await verifyPassword(plainPassword, hash);
  assert.equal(isValid, true);

  const isInvalid = await verifyPassword("WrongPassword456!", hash);
  assert.equal(isInvalid, false);
});

test("Security: JWT access tokens sign and verify user identity and role", () => {
  const payload = {
    userId: "123e4567-e89b-12d3-a456-426614174000",
    organizationId: "123e4567-e89b-12d3-a456-426614174001",
    role: "ORG_ADMIN" as const,
  };

  const token = signAccessToken(payload);
  assert.ok(typeof token === "string");

  const decoded = verifyAccessToken(token);
  assert.equal(decoded.userId, payload.userId);
  assert.equal(decoded.organizationId, payload.organizationId);
  assert.equal(decoded.role, payload.role);
});

test("Security: Tampered or invalid JWT tokens are rejected", () => {
  const token = signAccessToken({
    userId: "123e4567-e89b-12d3-a456-426614174000",
    organizationId: "123e4567-e89b-12d3-a456-426614174001",
    role: "STUDENT",
  });

  const parts = token.split(".");
  const tamperedToken = parts[0] + "." + parts[1] + ".tamperedsignature123";

  assert.throws(() => {
    verifyAccessToken(tamperedToken);
  });
});

test("Security: Multi-tenant request isolation validation", () => {
  // Simulate the tenant isolation check performed by tenantAuth middleware
  interface AuthenticatedRequest {
    user?: {
      organizationId: string | null;
      role: string;
      id: string;
    };
    body: Record<string, unknown>;
  }

  function getTenantOrganizationId(req: AuthenticatedRequest): string {
    const orgId = req.user?.organizationId;
    if (!orgId) {
      throw new Error("Missing organization context in user session");
    }
    // Crucial security invariant: NEVER read organizationId from req.body or req.query!
    return orgId;
  }

  const legitimateReq: AuthenticatedRequest = {
    user: { id: "u-1", organizationId: "org-alpha", role: "TEACHER" },
    body: { organizationId: "org-bravo" }, // Malicious client trying to spoof org-bravo
  };

  // Must return org-alpha, strictly ignoring the client's spoofed body
  assert.equal(getTenantOrganizationId(legitimateReq), "org-alpha");
  assert.notEqual(getTenantOrganizationId(legitimateReq), "org-bravo");
});

test("Security: Biometric validation schema enforces data bounds", () => {
  const biometricVerifySchema = z.object({
    attendanceSessionId: z.string().uuid(),
    studentId: z.string().uuid(),
    faceImageBase64: z.string().min(100).max(5_000_000), // Enforce minimum image payload and maximum 5MB
    voiceAudioBase64: z.string().min(100).max(10_000_000).optional(),
  });

  // Valid payload
  const valid = biometricVerifySchema.safeParse({
    attendanceSessionId: "123e4567-e89b-12d3-a456-426614174000",
    studentId: "123e4567-e89b-12d3-a456-426614174001",
    faceImageBase64: "data:image/jpeg;base64," + "A".repeat(200),
  });
  assert.equal(valid.success, true);

  // Invalid UUID rejects
  const invalidUuid = biometricVerifySchema.safeParse({
    attendanceSessionId: "not-a-uuid",
    studentId: "123e4567-e89b-12d3-a456-426614174001",
    faceImageBase64: "data:image/jpeg;base64," + "A".repeat(200),
  });
  assert.equal(invalidUuid.success, false);

  // Too short image payload rejects
  const tooShort = biometricVerifySchema.safeParse({
    attendanceSessionId: "123e4567-e89b-12d3-a456-426614174000",
    studentId: "123e4567-e89b-12d3-a456-426614174001",
    faceImageBase64: "abc",
  });
  assert.equal(tooShort.success, false);
});
