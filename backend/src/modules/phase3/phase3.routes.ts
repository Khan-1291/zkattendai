import { Router, Request } from "express";
import { Prisma, StudentStatus, TeacherStatus, EnrollmentStatus } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { authorizeRole } from "../../middleware/authorizeRole";
import { resolveOrganization } from "../../middleware/resolveOrganization";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

export const phase3Router = Router();

const admin = [authenticate, resolveOrganization, authorizeRole("ORG_ADMIN", "HOD")] as const;
const tenantAuth = [authenticate, resolveOrganization] as const;
const id = z.string().uuid();
const text = z.string().trim().min(1).max(120);
const email = z.string().email();
const password = z.string().min(8).max(128);
const studentStatus = z.nativeEnum(StudentStatus);
const teacherStatus = z.nativeEnum(TeacherStatus);
const enrollmentStatus = z.nativeEnum(EnrollmentStatus);

const studentCreate = z.object({
  fullName: text,
  email,
  password,
  studentNumber: text,
  departmentId: id,
  programId: id,
  currentSectionId: id.optional(),
});
const studentUpdate = z.object({
  fullName: text.optional(),
  studentNumber: text.optional(),
  departmentId: id.optional(),
  programId: id.optional(),
  currentSectionId: id.nullable().optional(),
  status: studentStatus.optional(),
});
const teacherCreate = z.object({
  fullName: text,
  email,
  password,
  employeeNumber: text,
  departmentId: id,
});
const teacherUpdate = z.object({
  fullName: text.optional(),
  employeeNumber: text.optional(),
  departmentId: id.optional(),
  status: teacherStatus.optional(),
});
const courseCreate = z.object({
  departmentId: id,
  code: text,
  title: text,
  description: z.string().trim().max(5000).nullable().optional(),
  creditHours: z.number().int().min(1).max(20),
});
const courseUpdate = courseCreate.partial().extend({ isActive: z.boolean().optional() });
const offeringCreate = z.object({
  courseId: id,
  academicTermId: id,
  programId: id,
  semesterId: id,
  sectionId: id,
  teacherId: id,
});
const offeringUpdate = offeringCreate.partial().extend({ isActive: z.boolean().optional() });
const enrollmentCreate = z.object({ studentId: id, courseOfferingId: id });
const enrollmentUpdate = z.object({ status: enrollmentStatus });

function tenant(req: Request) {
  return req.user!.organizationId!;
}

function errorWithStatus(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function nextError(err: unknown, next: (error?: unknown) => void) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return next(errorWithStatus("A record with these details already exists", 409));
    if (err.code === "P2025" || err.code === "P2003") return next(errorWithStatus("Resource not found", 404));
  }
  return next(err);
}

const userSelect = { id: true, fullName: true, email: true, isActive: true } as const;
const studentInclude = { user: { select: userSelect }, department: { select: { id: true, name: true, code: true } }, program: { select: { id: true, name: true, code: true } }, currentSection: { select: { id: true, name: true, code: true } } } as const;
const teacherInclude = { user: { select: userSelect }, department: { select: { id: true, name: true, code: true } } } as const;
const courseInclude = { department: { select: { id: true, name: true, code: true } } } as const;
const offeringInclude = { course: { select: { id: true, code: true, title: true } }, academicTerm: { select: { id: true, name: true, code: true } }, program: { select: { id: true, name: true, code: true } }, semester: { select: { id: true, name: true, code: true } }, section: { select: { id: true, name: true, code: true } }, teacher: { include: teacherInclude } } as const;

async function academicContext(organizationId: string, input: { departmentId: string; programId: string; sectionId?: string | null }) {
  const department = await prisma.department.findFirst({ where: { id: input.departmentId, organizationId, isActive: true } });
  const program = await prisma.program.findFirst({ where: { id: input.programId, organizationId, isActive: true } });
  if (!department || !program || program.departmentId !== department.id) throw errorWithStatus("Resource not found", 404);
  if (input.sectionId) {
    const section = await prisma.section.findFirst({ where: { id: input.sectionId, organizationId, isActive: true } });
    if (!section || section.programId !== program.id) throw errorWithStatus("Resource not found", 404);
  }
}

async function offeringContext(organizationId: string, input: z.infer<typeof offeringCreate>) {
  const [course, term, program, semester, section, teacher] = await Promise.all([
    prisma.course.findFirst({ where: { id: input.courseId, organizationId, isActive: true } }),
    prisma.academicTerm.findFirst({ where: { id: input.academicTermId, organizationId, isActive: true } }),
    prisma.program.findFirst({ where: { id: input.programId, organizationId, isActive: true } }),
    prisma.semester.findFirst({ where: { id: input.semesterId, organizationId, isActive: true } }),
    prisma.section.findFirst({ where: { id: input.sectionId, organizationId, isActive: true } }),
    prisma.teacher.findFirst({ where: { id: input.teacherId, organizationId, status: "ACTIVE" } }),
  ]);
  if (!course || !term || !program || !semester || !section || !teacher) throw errorWithStatus("Resource not found", 404);
  if (semester.academicTermId !== term.id || section.semesterId !== semester.id || section.programId !== program.id || course.departmentId !== program.departmentId || teacher.departmentId !== course.departmentId) {
    throw errorWithStatus("Academic relationships are not compatible", 400);
  }
}

// Self-service routes use req.user.userId and never accept a user ID from the client.
phase3Router.get("/students/me", ...tenantAuth, authorizeRole("STUDENT"), async (req, res, next) => {
  try {
    const student = await prisma.student.findFirst({ where: { organizationId: tenant(req), userId: req.user!.userId }, include: studentInclude });
    if (!student) return res.status(404).json({ error: "Resource not found" });
    return res.json({ student });
  } catch (err) { return next(err); }
});

phase3Router.get("/teachers/me", ...tenantAuth, authorizeRole("TEACHER"), async (req, res, next) => {
  try {
    const teacher = await prisma.teacher.findFirst({ where: { organizationId: tenant(req), userId: req.user!.userId }, include: teacherInclude });
    if (!teacher) return res.status(404).json({ error: "Resource not found" });
    return res.json({ teacher });
  } catch (err) { return next(err); }
});

phase3Router.get("/teachers/me/offerings", ...tenantAuth, authorizeRole("TEACHER"), async (req, res, next) => {
  try {
    const teacher = await prisma.teacher.findFirst({ where: { organizationId: tenant(req), userId: req.user!.userId } });
    if (!teacher) return res.status(404).json({ error: "Resource not found" });
    const offerings = await prisma.courseOffering.findMany({ where: { organizationId: tenant(req), teacherId: teacher.id }, include: offeringInclude, orderBy: { createdAt: "desc" } });
    return res.json({ offerings });
  } catch (err) { return next(err); }
});

phase3Router.get("/enrollments/me", ...tenantAuth, authorizeRole("STUDENT"), async (req, res, next) => {
  try {
    const student = await prisma.student.findFirst({ where: { organizationId: tenant(req), userId: req.user!.userId } });
    if (!student) return res.status(404).json({ error: "Resource not found" });
    const enrollments = await prisma.studentEnrollment.findMany({ where: { organizationId: tenant(req), studentId: student.id }, include: { section: { select: { id: true, name: true, code: true } }, courseOffering: { include: offeringInclude } }, orderBy: { enrolledAt: "desc" } });
    return res.json({ enrollments });
  } catch (err) { return next(err); }
});

phase3Router.get("/course-offerings/mine", ...tenantAuth, authorizeRole("TEACHER"), async (req, res, next) => {
  try {
    const teacher = await prisma.teacher.findFirst({ where: { organizationId: tenant(req), userId: req.user!.userId } });
    if (!teacher) return res.status(404).json({ error: "Resource not found" });
    const offerings = await prisma.courseOffering.findMany({ where: { organizationId: tenant(req), teacherId: teacher.id }, include: offeringInclude });
    return res.json({ offerings });
  } catch (err) { return next(err); }
});

phase3Router.use(...admin);

phase3Router.post("/students", async (req, res, next) => {
  try {
    const input = studentCreate.parse(req.body);
    const organizationId = tenant(req);
    await academicContext(organizationId, input);
    const userExists = await prisma.user.findUnique({ where: { email: input.email } });
    if (userExists) throw errorWithStatus("An account with this email already exists", 409);
    const passwordHash = await hashPassword(input.password);
    const student = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { organizationId, fullName: input.fullName, email: input.email, passwordHash, role: "STUDENT" } });
      return tx.student.create({ data: { organizationId, userId: user.id, studentNumber: input.studentNumber, departmentId: input.departmentId, programId: input.programId, currentSectionId: input.currentSectionId }, include: studentInclude });
    });
    return res.status(201).json({ student });
  } catch (err) { return nextError(err, next); }
});

phase3Router.get("/students", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const students = await prisma.student.findMany({ where: { organizationId: tenant(req), ...(search ? { OR: [{ studentNumber: { contains: search, mode: "insensitive" } }, { user: { fullName: { contains: search, mode: "insensitive" } } }] } : {}) }, include: studentInclude, orderBy: { createdAt: "desc" } });
    return res.json({ students });
  } catch (err) { return next(err); }
});

phase3Router.get("/students/:id", async (req, res, next) => {
  try {
    const student = await prisma.student.findFirst({ where: { id: id.parse(req.params.id), organizationId: tenant(req) }, include: studentInclude });
    if (!student) return res.status(404).json({ error: "Resource not found" });
    return res.json({ student });
  } catch (err) { return next(err); }
});

phase3Router.patch("/students/:id", async (req, res, next) => {
  try {
    const input = studentUpdate.parse(req.body);
    const organizationId = tenant(req);
    const current = await prisma.student.findFirst({ where: { id: id.parse(req.params.id), organizationId } });
    if (!current) return res.status(404).json({ error: "Resource not found" });
    await academicContext(organizationId, { departmentId: input.departmentId ?? current.departmentId, programId: input.programId ?? current.programId, sectionId: input.currentSectionId === undefined ? current.currentSectionId : input.currentSectionId });
    const student = await prisma.$transaction(async (tx) => {
      if (input.fullName) await tx.user.update({ where: { id: current.userId }, data: { fullName: input.fullName } });
      if (input.status) await tx.user.update({ where: { id: current.userId }, data: { isActive: input.status === "ACTIVE" } });
      return tx.student.update({ where: { id: current.id }, data: { studentNumber: input.studentNumber, departmentId: input.departmentId, programId: input.programId, currentSectionId: input.currentSectionId, status: input.status }, include: studentInclude });
    });
    return res.json({ student });
  } catch (err) { return nextError(err, next); }
});

phase3Router.delete("/students/:id", async (req, res, next) => {
  try {
    const current = await prisma.student.findFirst({ where: { id: id.parse(req.params.id), organizationId: tenant(req) } });
    if (!current) return res.status(404).json({ error: "Resource not found" });
    const student = await prisma.$transaction(async (tx) => { await tx.user.update({ where: { id: current.userId }, data: { isActive: false } }); return tx.student.update({ where: { id: current.id }, data: { status: "INACTIVE" }, include: studentInclude }); });
    return res.json({ student });
  } catch (err) { return nextError(err, next); }
});

phase3Router.post("/teachers", async (req, res, next) => {
  try {
    const input = teacherCreate.parse(req.body);
    const organizationId = tenant(req);
    const department = await prisma.department.findFirst({ where: { id: input.departmentId, organizationId, isActive: true } });
    if (!department) return res.status(404).json({ error: "Resource not found" });
    if (await prisma.user.findUnique({ where: { email: input.email } })) throw errorWithStatus("An account with this email already exists", 409);
    const passwordHash = await hashPassword(input.password);
    const teacher = await prisma.$transaction(async (tx) => { const user = await tx.user.create({ data: { organizationId, fullName: input.fullName, email: input.email, passwordHash, role: "TEACHER" } }); return tx.teacher.create({ data: { organizationId, userId: user.id, employeeNumber: input.employeeNumber, departmentId: input.departmentId }, include: teacherInclude }); });
    return res.status(201).json({ teacher });
  } catch (err) { return nextError(err, next); }
});

phase3Router.get("/teachers", async (req, res, next) => {
  try { const teachers = await prisma.teacher.findMany({ where: { organizationId: tenant(req) }, include: teacherInclude, orderBy: { createdAt: "desc" } }); return res.json({ teachers }); } catch (err) { return next(err); }
});

phase3Router.get("/teachers/:id", async (req, res, next) => {
  try { const teacher = await prisma.teacher.findFirst({ where: { id: id.parse(req.params.id), organizationId: tenant(req) }, include: teacherInclude }); if (!teacher) return res.status(404).json({ error: "Resource not found" }); return res.json({ teacher }); } catch (err) { return next(err); }
});

phase3Router.patch("/teachers/:id", async (req, res, next) => {
  try { const input = teacherUpdate.parse(req.body); const current = await prisma.teacher.findFirst({ where: { id: id.parse(req.params.id), organizationId: tenant(req) } }); if (!current) return res.status(404).json({ error: "Resource not found" }); if (input.departmentId && !(await prisma.department.findFirst({ where: { id: input.departmentId, organizationId: tenant(req), isActive: true } }))) return res.status(404).json({ error: "Resource not found" }); const teacher = await prisma.$transaction(async (tx) => { if (input.fullName) await tx.user.update({ where: { id: current.userId }, data: { fullName: input.fullName } }); if (input.status) await tx.user.update({ where: { id: current.userId }, data: { isActive: input.status === "ACTIVE" } }); return tx.teacher.update({ where: { id: current.id }, data: { employeeNumber: input.employeeNumber, departmentId: input.departmentId, status: input.status }, include: teacherInclude }); }); return res.json({ teacher }); } catch (err) { return nextError(err, next); }
});

phase3Router.delete("/teachers/:id", async (req, res, next) => {
  try { const current = await prisma.teacher.findFirst({ where: { id: id.parse(req.params.id), organizationId: tenant(req) } }); if (!current) return res.status(404).json({ error: "Resource not found" }); const teacher = await prisma.$transaction(async (tx) => { await tx.user.update({ where: { id: current.userId }, data: { isActive: false } }); return tx.teacher.update({ where: { id: current.id }, data: { status: "INACTIVE" }, include: teacherInclude }); }); return res.json({ teacher }); } catch (err) { return nextError(err, next); }
});

phase3Router.post("/courses", async (req, res, next) => {
  try { const input = courseCreate.parse(req.body); if (!(await prisma.department.findFirst({ where: { id: input.departmentId, organizationId: tenant(req), isActive: true } }))) return res.status(404).json({ error: "Resource not found" }); const course = await prisma.course.create({ data: { ...input, organizationId: tenant(req) }, include: courseInclude }); return res.status(201).json({ course }); } catch (err) { return nextError(err, next); }
});

phase3Router.get("/courses", async (req, res, next) => {
  try { const courses = await prisma.course.findMany({ where: { organizationId: tenant(req) }, include: courseInclude, orderBy: { code: "asc" } }); return res.json({ courses }); } catch (err) { return next(err); }
});

phase3Router.get("/courses/:id", async (req, res, next) => {
  try { const course = await prisma.course.findFirst({ where: { id: id.parse(req.params.id), organizationId: tenant(req) }, include: courseInclude }); if (!course) return res.status(404).json({ error: "Resource not found" }); return res.json({ course }); } catch (err) { return next(err); }
});

phase3Router.patch("/courses/:id", async (req, res, next) => {
  try { const input = courseUpdate.parse(req.body); const current = await prisma.course.findFirst({ where: { id: id.parse(req.params.id), organizationId: tenant(req) } }); if (!current) return res.status(404).json({ error: "Resource not found" }); if (input.departmentId && !(await prisma.department.findFirst({ where: { id: input.departmentId, organizationId: tenant(req), isActive: true } }))) return res.status(404).json({ error: "Resource not found" }); const course = await prisma.course.update({ where: { id: current.id }, data: input, include: courseInclude }); return res.json({ course }); } catch (err) { return nextError(err, next); }
});

phase3Router.delete("/courses/:id", async (req, res, next) => {
  try { const result = await prisma.course.updateMany({ where: { id: id.parse(req.params.id), organizationId: tenant(req) }, data: { isActive: false } }); if (!result.count) return res.status(404).json({ error: "Resource not found" }); const course = await prisma.course.findUniqueOrThrow({ where: { id: id.parse(req.params.id) }, include: courseInclude }); return res.json({ course }); } catch (err) { return nextError(err, next); }
});

phase3Router.post("/course-offerings", async (req, res, next) => {
  try { const input = offeringCreate.parse(req.body); await offeringContext(tenant(req), input); const offering = await prisma.courseOffering.create({ data: { ...input, organizationId: tenant(req) }, include: offeringInclude }); return res.status(201).json({ offering }); } catch (err) { return nextError(err, next); }
});

phase3Router.get("/course-offerings", async (req, res, next) => {
  try { const offerings = await prisma.courseOffering.findMany({ where: { organizationId: tenant(req) }, include: offeringInclude, orderBy: { createdAt: "desc" } }); return res.json({ offerings }); } catch (err) { return next(err); }
});

phase3Router.get("/course-offerings/:id", async (req, res, next) => {
  try { const offering = await prisma.courseOffering.findFirst({ where: { id: id.parse(req.params.id), organizationId: tenant(req) }, include: offeringInclude }); if (!offering) return res.status(404).json({ error: "Resource not found" }); return res.json({ offering }); } catch (err) { return next(err); }
});

phase3Router.patch("/course-offerings/:id", async (req, res, next) => {
  try { const input = offeringUpdate.parse(req.body); const current = await prisma.courseOffering.findFirst({ where: { id: id.parse(req.params.id), organizationId: tenant(req) } }); if (!current) return res.status(404).json({ error: "Resource not found" }); const nextOffering = { courseId: input.courseId ?? current.courseId, academicTermId: input.academicTermId ?? current.academicTermId, programId: input.programId ?? current.programId, semesterId: input.semesterId ?? current.semesterId, sectionId: input.sectionId ?? current.sectionId, teacherId: input.teacherId ?? current.teacherId }; await offeringContext(tenant(req), nextOffering); const offering = await prisma.courseOffering.update({ where: { id: current.id }, data: input, include: offeringInclude }); return res.json({ offering }); } catch (err) { return nextError(err, next); }
});

phase3Router.delete("/course-offerings/:id", async (req, res, next) => {
  try { const result = await prisma.courseOffering.updateMany({ where: { id: id.parse(req.params.id), organizationId: tenant(req) }, data: { isActive: false } }); if (!result.count) return res.status(404).json({ error: "Resource not found" }); const offering = await prisma.courseOffering.findUniqueOrThrow({ where: { id: id.parse(req.params.id) }, include: offeringInclude }); return res.json({ offering }); } catch (err) { return nextError(err, next); }
});

phase3Router.post("/enrollments", async (req, res, next) => {
  try { const input = enrollmentCreate.parse(req.body); const organizationId = tenant(req); const [student, offering] = await Promise.all([prisma.student.findFirst({ where: { id: input.studentId, organizationId, status: "ACTIVE" } }), prisma.courseOffering.findFirst({ where: { id: input.courseOfferingId, organizationId, isActive: true } })]); if (!student || !offering) return res.status(404).json({ error: "Resource not found" }); if (student.currentSectionId !== offering.sectionId) throw errorWithStatus("Student section is not compatible with this offering", 400); const enrollment = await prisma.studentEnrollment.create({ data: { organizationId, studentId: student.id, courseOfferingId: offering.id, sectionId: offering.sectionId }, include: { student: { include: studentInclude }, courseOffering: { include: offeringInclude }, section: { select: { id: true, name: true, code: true } } } }); return res.status(201).json({ enrollment }); } catch (err) { return nextError(err, next); }
});

phase3Router.get("/enrollments", async (req, res, next) => {
  try { const enrollments = await prisma.studentEnrollment.findMany({ where: { organizationId: tenant(req) }, include: { student: { include: studentInclude }, courseOffering: { include: offeringInclude }, section: { select: { id: true, name: true, code: true } } }, orderBy: { enrolledAt: "desc" } }); return res.json({ enrollments }); } catch (err) { return next(err); }
});

phase3Router.get("/enrollments/:id", async (req, res, next) => {
  try { const enrollment = await prisma.studentEnrollment.findFirst({ where: { id: id.parse(req.params.id), organizationId: tenant(req) }, include: { student: { include: studentInclude }, courseOffering: { include: offeringInclude }, section: { select: { id: true, name: true, code: true } } } }); if (!enrollment) return res.status(404).json({ error: "Resource not found" }); return res.json({ enrollment }); } catch (err) { return next(err); }
});

phase3Router.patch("/enrollments/:id", async (req, res, next) => {
  try { const input = enrollmentUpdate.parse(req.body); const current = await prisma.studentEnrollment.findFirst({ where: { id: id.parse(req.params.id), organizationId: tenant(req) } }); if (!current) return res.status(404).json({ error: "Resource not found" }); const enrollment = await prisma.studentEnrollment.update({ where: { id: current.id }, data: { status: input.status, droppedAt: input.status === "DROPPED" || input.status === "WITHDRAWN" ? new Date() : null }, include: { student: { include: studentInclude }, courseOffering: { include: offeringInclude }, section: { select: { id: true, name: true, code: true } } } }); return res.json({ enrollment }); } catch (err) { return nextError(err, next); }
});

phase3Router.delete("/enrollments/:id", async (req, res, next) => {
  try { const current = await prisma.studentEnrollment.findFirst({ where: { id: id.parse(req.params.id), organizationId: tenant(req) } }); if (!current) return res.status(404).json({ error: "Resource not found" }); const enrollment = await prisma.studentEnrollment.update({ where: { id: current.id }, data: { status: "DROPPED", droppedAt: new Date() } }); return res.json({ enrollment }); } catch (err) { return nextError(err, next); }
});
