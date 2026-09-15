import { Request, Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { authorizeRole } from "../../middleware/authorizeRole";
import { resolveOrganization } from "../../middleware/resolveOrganization";
import { prisma } from "../../lib/prisma";
import {
  deactivateBiometrics,
  detectFace,
  enrollFace,
  enrollVoice,
  generateLivenessChallenge,
  getOrgBiometricSettings,
  getStudentBiometricStatus,
  resetOrgBiometricSettings,
  updateOrgBiometricSettings,
  verifyBiometricAttendance,
} from "./biometrics.service";

export const biometricsRouter = Router();

const tenantAuth = [authenticate, resolveOrganization] as const;
const adminAuth = [authenticate, resolveOrganization, authorizeRole("ORG_ADMIN", "HOD")] as const;
const staffAuth = [authenticate, resolveOrganization, authorizeRole("ORG_ADMIN", "HOD", "TEACHER")] as const;

function organizationId(req: Request): string {
  return req.user!.organizationId!;
}

biometricsRouter.get("/challenge", ...tenantAuth, (req, res) => {
  const preferredType = typeof req.query.type === "string" ? req.query.type : undefined;
  const timeout = typeof req.query.timeout === "string" ? Math.max(5, parseInt(req.query.timeout, 10)) : 15;
  const challenge = generateLivenessChallenge(preferredType, timeout);
  return res.json(challenge);
});

biometricsRouter.post("/face/detect", ...tenantAuth, async (req, res, next) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "imageBase64 string is required" });
    }
    const result = await detectFace(imageBase64);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

async function resolveStudentForUser(req: Request, targetStudentId?: string) {
  if (req.user!.role === "STUDENT") {
    const selfStudent = await prisma.student.findFirst({
      where: { organizationId: organizationId(req), userId: req.user!.userId },
    });
    if (!selfStudent) throw Object.assign(new Error("Student profile not found"), { status: 404 });
    if (targetStudentId && targetStudentId !== selfStudent.id) {
      throw Object.assign(new Error("Students can only manage their own biometrics"), { status: 403 });
    }
    return selfStudent.id;
  }
  if (!targetStudentId) {
    throw Object.assign(new Error("Student ID is required"), { status: 400 });
  }
  return targetStudentId;
}

const faceEnrollSchema = z.object({
  studentId: z.string().uuid().optional(),
  images: z.array(z.string().min(10)).min(1).max(6),
});

const voiceEnrollSchema = z.object({
  studentId: z.string().uuid().optional(),
  audios: z.array(z.string().min(10)).min(1).max(5),
});

const verifySchema = z.object({
  attendanceSessionId: z.string().uuid(),
  studentId: z.string().uuid(),
  faceImageBase64: z.string().min(10).optional(),
  voiceAudioBase64: z.string().min(10).optional(),
  livenessData: z
    .object({
      challengeType: z.string(),
      imageBase64: z.string().min(10),
    })
    .optional(),
}).refine(
  (data: { faceImageBase64?: string; voiceAudioBase64?: string }) => Boolean(data.faceImageBase64 || data.voiceAudioBase64),
  { message: "At least one biometric sample (faceImageBase64 or voiceAudioBase64) must be provided" },
);

const settingsUpdateSchema = z.object({
  verificationMode: z.enum(["NORMAL", "SECURE"]).optional(),
  verificationPolicy: z.enum(["FACE_ONLY", "VOICE_ONLY", "FACE_AND_VOICE", "FACE_OR_VOICE"]).optional(),
  faceVerificationEnabled: z.boolean().optional(),
  faceEnrollmentEnabled: z.boolean().optional(),
  faceThreshold: z.number().min(0.1).max(0.99).optional(),
  faceConfidenceThreshold: z.number().min(0.1).max(0.99).optional(),
  maxFaceEnrollmentImages: z.number().int().min(1).max(10).optional(),
  livenessEnabled: z.boolean().optional(),
  voiceVerificationEnabled: z.boolean().optional(),
  voiceEnrollmentEnabled: z.boolean().optional(),
  voiceThreshold: z.number().min(0.1).max(0.99).optional(),
  minVoiceDurationSeconds: z.number().int().min(1).max(30).optional(),
  maxVoiceDurationSeconds: z.number().int().min(2).max(60).optional(),
  challengeEnabled: z.boolean().optional(),
  challengeType: z.string().optional(),
  challengeAttempts: z.number().int().min(1).max(10).optional(),
  challengeTimeoutSeconds: z.number().int().min(5).max(120).optional(),
  requireLiveness: z.boolean().optional(),
  livenessThreshold: z.number().min(0.1).max(0.99).optional(),
  livenessChallengeCount: z.number().int().min(1).max(5).optional(),
});

/**
 * Enroll student face biometric samples.
 */
biometricsRouter.post("/face/enroll", ...tenantAuth, async (req, res, next) => {
  try {
    const input = faceEnrollSchema.parse(req.body);
    const studentId = await resolveStudentForUser(req, input.studentId);
    const enrollment = await enrollFace(organizationId(req), studentId, input.images);
    return res.status(201).json({
      success: true,
      enrollment: {
        id: enrollment.id,
        studentId: enrollment.studentId,
        qualityScore: enrollment.qualityScore,
        sampleCount: enrollment.sampleCount,
        enrolledAt: enrollment.enrolledAt,
      },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Enroll student voice biometric samples.
 */
biometricsRouter.post("/voice/enroll", ...tenantAuth, async (req, res, next) => {
  try {
    const input = voiceEnrollSchema.parse(req.body);
    const studentId = await resolveStudentForUser(req, input.studentId);
    const enrollment = await enrollVoice(organizationId(req), studentId, input.audios);
    return res.status(201).json({
      success: true,
      enrollment: {
        id: enrollment.id,
        studentId: enrollment.studentId,
        qualityScore: enrollment.qualityScore,
        sampleCount: enrollment.sampleCount,
        enrolledAt: enrollment.enrolledAt,
      },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Get biometric enrollment status for current authenticated student.
 */
biometricsRouter.get("/my-status", ...tenantAuth, authorizeRole("STUDENT"), async (req, res, next) => {
  try {
    const studentId = await resolveStudentForUser(req);
    const status = await getStudentBiometricStatus(organizationId(req), studentId);
    return res.json(status);
  } catch (error) {
    return next(error);
  }
});

/**
 * Get biometric enrollment status for any student.
 */
biometricsRouter.get("/status/:studentId", ...tenantAuth, async (req, res, next) => {
  try {
    const targetStudentId = z.string().uuid().parse(req.params.studentId);
    const studentId = await resolveStudentForUser(req, targetStudentId);
    const status = await getStudentBiometricStatus(organizationId(req), studentId);
    return res.json(status);
  } catch (error) {
    return next(error);
  }
});

/**
 * Deactivate biometric enrollment for student.
 */
biometricsRouter.post("/deactivate/:studentId", ...staffAuth, async (req, res, next) => {
  try {
    const studentId = z.string().uuid().parse(req.params.studentId);
    const type = z.enum(["FACE", "VOICE", "ALL"]).optional().parse(req.body.type) ?? "ALL";
    const result = await deactivateBiometrics(organizationId(req), studentId, type);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

/**
 * Perform live multimodal biometric attendance verification.
 */
biometricsRouter.post("/verify", ...tenantAuth, async (req, res, next) => {
  try {
    const input = verifySchema.parse(req.body);
    const result = await verifyBiometricAttendance({
      organizationId: organizationId(req),
      attendanceSessionId: input.attendanceSessionId,
      studentId: input.studentId,
      faceImageBase64: input.faceImageBase64,
      voiceAudioBase64: input.voiceAudioBase64,
      livenessData: input.livenessData
        ? {
            challengeType: input.livenessData.challengeType,
            imageBase64: input.livenessData.imageBase64,
          }
        : undefined,
    });

    if (!result.verified) {
      return res.status(422).json({
        verified: false,
        method: result.method,
        similarity: result.similarity,
        threshold: result.threshold,
        liveness: result.liveness,
        challengePassed: result.challengePassed,
        message: result.message,
        error: result.message,
        metrics: result.metrics,
        attemptId: result.attemptId,
      });
    }

    return res.status(200).json({
      verified: true,
      method: result.method,
      similarity: result.similarity,
      threshold: result.threshold,
      liveness: result.liveness,
      challengePassed: result.challengePassed,
      message: result.message,
      record: result.record,
      metrics: result.metrics,
      attemptId: result.attemptId,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Get organization biometric settings.
 */
biometricsRouter.get("/settings", ...tenantAuth, async (req, res, next) => {
  try {
    const settings = await getOrgBiometricSettings(organizationId(req));
    return res.json({ settings });
  } catch (error) {
    return next(error);
  }
});

/**
 * Update organization biometric settings (PATCH / PUT).
 */
async function handleUpdateSettings(req: Request, res: any, next: any) {
  try {
    const input = settingsUpdateSchema.parse(req.body);
    const updated = await updateOrgBiometricSettings(organizationId(req), input, req.user!.userId);
    return res.json({ settings: updated });
  } catch (error) {
    return next(error);
  }
}

biometricsRouter.patch("/settings", ...adminAuth, handleUpdateSettings);
biometricsRouter.put("/settings", ...adminAuth, handleUpdateSettings);

/**
 * Reset organization biometric settings to system defaults.
 */
biometricsRouter.post("/settings/reset", ...adminAuth, async (req, res, next) => {
  try {
    const settings = await resetOrgBiometricSettings(organizationId(req), req.user!.userId);
    return res.json({
      success: true,
      message: "Biometric settings reset to defaults",
      settings,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Get verification attempts history (for analytics and FYP evaluation).
 */
biometricsRouter.get("/attempts", ...staffAuth, async (req, res, next) => {
  try {
    const sessionId = req.query.sessionId as string | undefined;
    const studentId = req.query.studentId as string | undefined;
    const limit = Math.min(100, Number(req.query.limit ?? 50));

    const attempts = await prisma.biometricVerificationAttempt.findMany({
      where: {
        organizationId: organizationId(req),
        ...(sessionId ? { attendanceSessionId: sessionId } : {}),
        ...(studentId ? { studentId } : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            studentNumber: true,
            user: { select: { fullName: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return res.json({ attempts });
  } catch (error) {
    return next(error);
  }
});
