import { Request, Router } from "express";
import { AttendanceSessionStatus, AttendanceStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { authorizeRole } from "../../middleware/authorizeRole";
import { resolveOrganization } from "../../middleware/resolveOrganization";
import { prisma } from "../../lib/prisma";
import { calculateAttendancePercentage } from "./attendance.service";

export const attendanceRouter = Router();
const tenantAuth = [authenticate, resolveOrganization] as const;
const admin = [authenticate, resolveOrganization, authorizeRole("ORG_ADMIN", "HOD")] as const;
const idSchema = z.string().uuid();
const statusSchema = z.nativeEnum(AttendanceStatus);
const sessionCreateSchema = z.object({
  courseOfferingId: idSchema,
  sessionDate: z.coerce.date(),
  title: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2000).optional(),
});
const sessionUpdateSchema = z.object({
  sessionDate: z.coerce.date().optional(),
  title: z.string().trim().max(160).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
const recordSchema = z.object({
  studentId: idSchema,
  status: statusSchema,
  notes: z.string().trim().max(1000).nullable().optional(),
});
const bulkRecordSchema = z.object({ records: z.array(recordSchema).min(1).max(500) });
const recordUpdateSchema = recordSchema.pick({ status: true, notes: true });
const dateFilterSchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), courseOfferingId: idSchema.optional(), teacherId: idSchema.optional(), status: z.nativeEnum(AttendanceSessionStatus).optional() });

function organizationId(req: Request) { return req.user!.organizationId!; }
function httpError(message: string, status: number) { return Object.assign(new Error(message), { status }); }
function handleError(error: unknown, next: (error?: unknown) => void) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return next(httpError("Attendance record already exists for this student and session", 409));
    if (error.code === "P2025" || error.code === "P2003") return next(httpError("Resource not found", 404));
  }
  return next(error);
}

const sessionInclude = {
  courseOffering: { include: { course: { select: { id: true, code: true, title: true } }, section: { select: { id: true, name: true, code: true } }, semester: { select: { id: true, name: true, code: true } } } },
  teacher: { include: { user: { select: { id: true, fullName: true, email: true } } } },
  _count: { select: { records: true } },
} as const;
const recordInclude = {
  student: { include: { user: { select: { id: true, fullName: true, email: true } } } },
  section: { select: { id: true, name: true, code: true } },
} as const;

async function teacherProfile(req: Request) {
  return prisma.teacher.findFirst({ where: { organizationId: organizationId(req), userId: req.user!.userId, status: "ACTIVE" } });
}

async function sessionForAccess(req: Request, sessionId: string) {
  const session = await prisma.attendanceSession.findFirst({ where: { id: sessionId, organizationId: organizationId(req) }, include: sessionInclude });
  if (!session) throw httpError("Resource not found", 404);
  if (req.user!.role === "TEACHER") {
    const teacher = await teacherProfile(req);
    if (!teacher || session.teacherId !== teacher.id) throw httpError("Resource not found", 404);
  }
  return session;
}

async function audit(actorUserId: string, organizationId: string, action: string, targetId: string, metadata: Record<string, string>) {
  await prisma.auditLog.create({ data: { actorUserId, organizationId, action, targetType: "Attendance", targetId, metadata } });
}

async function createRecords(req: Request, sessionId: string, inputs: z.infer<typeof bulkRecordSchema>["records"], manualOverride: boolean, upsertExisting = false) {
  const session = await sessionForAccess(req, sessionId);
  if (session.status !== "OPEN" && !manualOverride) throw httpError("Closed or cancelled sessions cannot be modified", 409);
  if (session.status === "CANCELLED") throw httpError("Cancelled sessions cannot be modified", 409);
  const enrollments = await prisma.studentEnrollment.findMany({ where: { organizationId: organizationId(req), courseOfferingId: session.courseOfferingId, status: "ENROLLED", studentId: { in: inputs.map((input) => input.studentId) } } });
  if (enrollments.length !== inputs.length) throw httpError("Student is not enrolled in this course offering", 400);
  const enrollmentByStudent = new Map(enrollments.map((enrollment) => [enrollment.studentId, enrollment]));
  const records = await prisma.$transaction(async (tx) => {
    const created = [];
    for (const input of inputs) {
      const enrollment = enrollmentByStudent.get(input.studentId)!;
      const existing = upsertExisting ? await tx.attendanceRecord.findFirst({ where: { organizationId: organizationId(req), attendanceSessionId: session.id, studentId: input.studentId } }) : null;
      const record = existing
        ? await tx.attendanceRecord.update({ where: { id: existing.id }, data: { status: input.status, notes: input.notes ?? null, verificationStatus: "MANUAL_OVERRIDE" }, include: recordInclude })
        : await tx.attendanceRecord.create({ data: { organizationId: organizationId(req), attendanceSessionId: session.id, studentId: input.studentId, enrollmentId: enrollment.id, sectionId: enrollment.sectionId, status: input.status, notes: input.notes ?? null, verificationStatus: "MANUAL_OVERRIDE" }, include: recordInclude });
      created.push(record);
    }
    return created;
  });
  await audit(req.user!.userId, organizationId(req), manualOverride ? "ATTENDANCE_MANUAL_OVERRIDE" : "ATTENDANCE_RECORD_CREATED", session.id, { sessionId: session.id, count: String(records.length), status: manualOverride ? "MANUAL_OVERRIDE" : "MANUAL" });
  return records;
}

async function updateRecord(req: Request, recordId: string, input: z.infer<typeof recordUpdateSchema>) {
  const record = await prisma.attendanceRecord.findFirst({ where: { id: recordId, organizationId: organizationId(req) }, include: { attendanceSession: true } });
  if (!record) throw httpError("Resource not found", 404);
  const isAdmin = req.user!.role === "ORG_ADMIN" || req.user!.role === "HOD";
  if (!isAdmin) {
    const teacher = await teacherProfile(req);
    if (!teacher || record.attendanceSession.teacherId !== teacher.id) throw httpError("Resource not found", 404);
  }
  if (record.attendanceSession.status === "CANCELLED") throw httpError("Cancelled sessions cannot be modified", 409);
  if (record.attendanceSession.status === "CLOSED" && !isAdmin) throw httpError("Closed sessions require an administrative manual override", 403);
  const manualOverride = record.attendanceSession.status === "CLOSED";
  const updated = await prisma.attendanceRecord.update({ where: { id: record.id }, data: { status: input.status, notes: input.notes ?? null, verificationStatus: manualOverride ? "MANUAL_OVERRIDE" : "MANUAL_OVERRIDE" }, include: recordInclude });
  await audit(req.user!.userId, organizationId(req), manualOverride ? "ATTENDANCE_MANUAL_OVERRIDE" : "ATTENDANCE_RECORD_UPDATED", record.id, { sessionId: record.attendanceSessionId, status: input.status });
  return updated;
}

attendanceRouter.post("/sessions", ...tenantAuth, async (req, res, next) => {
  try {
    if (!["ORG_ADMIN", "HOD", "TEACHER"].includes(req.user!.role)) return res.status(403).json({ error: "You do not have permission to perform this action" });
    const input = sessionCreateSchema.parse(req.body);
    const offering = await prisma.courseOffering.findFirst({ where: { id: input.courseOfferingId, organizationId: organizationId(req), isActive: true } });
    if (!offering) return res.status(404).json({ error: "Resource not found" });
    if (req.user!.role === "TEACHER") {
      const teacher = await teacherProfile(req);
      if (!teacher || offering.teacherId !== teacher.id) return res.status(404).json({ error: "Resource not found" });
    }
    const session = await prisma.attendanceSession.create({ data: { organizationId: organizationId(req), courseOfferingId: offering.id, teacherId: offering.teacherId, sessionDate: input.sessionDate, title: input.title, notes: input.notes }, include: sessionInclude });
    await audit(req.user!.userId, organizationId(req), "ATTENDANCE_SESSION_CREATED", session.id, { sessionId: session.id, status: session.status });
    return res.status(201).json({ session });
  } catch (error) { return handleError(error, next); }
});

attendanceRouter.get("/sessions", ...tenantAuth, async (req, res, next) => {
  try {
    const filters = dateFilterSchema.parse(req.query);
    const where: Prisma.AttendanceSessionWhereInput = { organizationId: organizationId(req), ...(filters.from || filters.to ? { sessionDate: { gte: filters.from, lte: filters.to } } : {}), ...(filters.courseOfferingId ? { courseOfferingId: filters.courseOfferingId } : {}), ...(filters.teacherId ? { teacherId: filters.teacherId } : {}), ...(filters.status ? { status: filters.status } : {}) };
    if (req.user!.role === "TEACHER") {
      const teacher = await teacherProfile(req);
      where.teacherId = teacher?.id ?? "";
    } else if (!["ORG_ADMIN", "HOD"].includes(req.user!.role)) return res.status(403).json({ error: "You do not have permission to perform this action" });
    const sessions = await prisma.attendanceSession.findMany({ where, include: sessionInclude, orderBy: { sessionDate: "desc" } });
    return res.json({ sessions });
  } catch (error) { return next(error); }
});

attendanceRouter.get("/sessions/:id", ...tenantAuth, async (req, res, next) => {
  try { return res.json({ session: await sessionForAccess(req, idSchema.parse(req.params.id)) }); } catch (error) { return next(error); }
});

attendanceRouter.patch("/sessions/:id", ...tenantAuth, async (req, res, next) => {
  try {
    const session = await sessionForAccess(req, idSchema.parse(req.params.id));
    if (session.status !== "OPEN") return next(httpError("Only open sessions can be edited", 409));
    if (!["ORG_ADMIN", "HOD", "TEACHER"].includes(req.user!.role)) return res.status(403).json({ error: "You do not have permission to perform this action" });
    const input = sessionUpdateSchema.parse(req.body);
    const updated = await prisma.attendanceSession.update({ where: { id: session.id }, data: input, include: sessionInclude });
    return res.json({ session: updated });
  } catch (error) { return handleError(error, next); }
});

attendanceRouter.post("/sessions/:id/close", ...tenantAuth, async (req, res, next) => {
  try { const session = await sessionForAccess(req, idSchema.parse(req.params.id)); if (session.status !== "OPEN") return next(httpError("Only open sessions can be closed", 409)); const updated = await prisma.attendanceSession.update({ where: { id: session.id }, data: { status: "CLOSED", closedAt: new Date() }, include: sessionInclude }); await audit(req.user!.userId, organizationId(req), "ATTENDANCE_SESSION_CLOSED", session.id, { sessionId: session.id, status: "CLOSED" }); return res.json({ session: updated }); } catch (error) { return handleError(error, next); }
});

attendanceRouter.post("/sessions/:id/cancel", ...tenantAuth, async (req, res, next) => {
  try { const session = await sessionForAccess(req, idSchema.parse(req.params.id)); if (session.status !== "OPEN") return next(httpError("Only open sessions can be cancelled", 409)); const updated = await prisma.attendanceSession.update({ where: { id: session.id }, data: { status: "CANCELLED" }, include: sessionInclude }); await audit(req.user!.userId, organizationId(req), "ATTENDANCE_SESSION_CANCELLED", session.id, { sessionId: session.id, status: "CANCELLED" }); return res.json({ session: updated }); } catch (error) { return handleError(error, next); }
});

attendanceRouter.get("/sessions/:id/eligible-students", ...tenantAuth, async (req, res, next) => {
  try { const session = await sessionForAccess(req, idSchema.parse(req.params.id)); const enrollments = await prisma.studentEnrollment.findMany({ where: { organizationId: organizationId(req), courseOfferingId: session.courseOfferingId, status: "ENROLLED" }, include: { student: { include: { user: { select: { id: true, fullName: true, email: true } } } }, attendanceRecords: { where: { attendanceSessionId: session.id } } }, orderBy: { student: { studentNumber: "asc" } } }); return res.json({ students: enrollments }); } catch (error) { return next(error); }
});

attendanceRouter.get("/sessions/:id/records", ...tenantAuth, async (req, res, next) => {
  try { const session = await sessionForAccess(req, idSchema.parse(req.params.id)); const records = await prisma.attendanceRecord.findMany({ where: { organizationId: organizationId(req), attendanceSessionId: session.id }, include: recordInclude, orderBy: { markedAt: "asc" } }); return res.json({ records }); } catch (error) { return next(error); }
});

attendanceRouter.post("/sessions/:id/records", ...tenantAuth, async (req, res, next) => {
  try { const input = recordSchema.parse(req.body); const isAdmin = req.user!.role === "ORG_ADMIN" || req.user!.role === "HOD"; const records = await createRecords(req, idSchema.parse(req.params.id), [input], isAdmin); return res.status(201).json({ record: records[0] }); } catch (error) { return handleError(error, next); }
});

attendanceRouter.post("/sessions/:id/records/bulk", ...tenantAuth, async (req, res, next) => {
  try { const input = bulkRecordSchema.parse(req.body); const isAdmin = req.user!.role === "ORG_ADMIN" || req.user!.role === "HOD"; const records = await createRecords(req, idSchema.parse(req.params.id), input.records, isAdmin, true); return res.status(201).json({ records }); } catch (error) { return handleError(error, next); }
});

attendanceRouter.patch("/records/:id", ...tenantAuth, async (req, res, next) => {
  try { const record = await updateRecord(req, idSchema.parse(req.params.id), recordUpdateSchema.parse(req.body)); return res.json({ record }); } catch (error) { return handleError(error, next); }
});

attendanceRouter.get("/students/me", ...tenantAuth, authorizeRole("STUDENT"), async (req, res, next) => {
  try { const student = await prisma.student.findFirst({ where: { organizationId: organizationId(req), userId: req.user!.userId } }); if (!student) return res.status(404).json({ error: "Resource not found" }); const records = await prisma.attendanceRecord.findMany({ where: { organizationId: organizationId(req), studentId: student.id, attendanceSession: { status: { not: "CANCELLED" } } }, include: { attendanceSession: { include: sessionInclude } }, orderBy: { markedAt: "desc" } }); return res.json({ records }); } catch (error) { return next(error); }
});

attendanceRouter.get("/students/:studentId", ...admin, async (req, res, next) => {
  try { const studentId = idSchema.parse(req.params.studentId); const student = await prisma.student.findFirst({ where: { id: studentId, organizationId: organizationId(req) } }); if (!student) return res.status(404).json({ error: "Resource not found" }); const records = await prisma.attendanceRecord.findMany({ where: { organizationId: organizationId(req), studentId, attendanceSession: { status: { not: "CANCELLED" } } }, include: { attendanceSession: { include: sessionInclude } }, orderBy: { markedAt: "desc" } }); return res.json({ records }); } catch (error) { return next(error); }
});

attendanceRouter.get("/offerings/:offeringId", ...tenantAuth, async (req, res, next) => {
  try { const offeringId = idSchema.parse(req.params.offeringId); const offering = await prisma.courseOffering.findFirst({ where: { id: offeringId, organizationId: organizationId(req) } }); if (!offering) return res.status(404).json({ error: "Resource not found" }); if (req.user!.role === "TEACHER") { const teacher = await teacherProfile(req); if (!teacher || teacher.id !== offering.teacherId) return res.status(404).json({ error: "Resource not found" }); } else if (!["ORG_ADMIN", "HOD"].includes(req.user!.role)) return res.status(403).json({ error: "You do not have permission to perform this action" }); const records = await prisma.attendanceRecord.findMany({ where: { organizationId: organizationId(req), attendanceSession: { courseOfferingId: offeringId, status: { not: "CANCELLED" } } }, include: { attendanceSession: true, student: { include: { user: { select: { fullName: true, email: true } } } } }, orderBy: { markedAt: "desc" } }); return res.json({ records }); } catch (error) { return next(error); }
});

attendanceRouter.get("/offerings/:offeringId/percentage", ...tenantAuth, async (req, res, next) => {
  try { const offeringId = idSchema.parse(req.params.offeringId); const offering = await prisma.courseOffering.findFirst({ where: { id: offeringId, organizationId: organizationId(req) } }); if (!offering) return res.status(404).json({ error: "Resource not found" }); let studentId: string | undefined; if (req.user!.role === "STUDENT") { const student = await prisma.student.findFirst({ where: { organizationId: organizationId(req), userId: req.user!.userId } }); if (!student) return res.status(404).json({ error: "Resource not found" }); studentId = student.id; } else if (req.user!.role === "TEACHER") { const teacher = await teacherProfile(req); if (!teacher || teacher.id !== offering.teacherId) return res.status(404).json({ error: "Resource not found" }); } else if (!["ORG_ADMIN", "HOD"].includes(req.user!.role)) return res.status(403).json({ error: "You do not have permission to perform this action" }); const records = await prisma.attendanceRecord.findMany({ where: { organizationId: organizationId(req), studentId, attendanceSession: { courseOfferingId: offeringId, status: { not: "CANCELLED" } } }, select: { studentId: true, status: true } }); const grouped = new Map<string, AttendanceStatus[]>(); for (const record of records) grouped.set(record.studentId, [...(grouped.get(record.studentId) ?? []), record.status]); const percentages = [...grouped.entries()].map(([id, statuses]) => ({ studentId: id, percentage: calculateAttendancePercentage(statuses) })); return res.json({ percentages }); } catch (error) { return next(error); }
});
