import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authenticate } from "../../middleware/authenticate";
import { authorizeRole } from "../../middleware/authorizeRole";
import { resolveOrganization } from "../../middleware/resolveOrganization";
import { prisma } from "../../lib/prisma";

export const academicRouter = Router();

const adminMiddleware = [
  authenticate,
  resolveOrganization,
  authorizeRole("ORG_ADMIN", "HOD"),
] as const;

const idSchema = z.string().uuid();
const nameSchema = z.string().trim().min(2).max(120);
const codeSchema = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const activeSchema = z.boolean().optional();
const dateSchema = z.coerce.date();

const departmentCreateSchema = z.object({ name: nameSchema, code: codeSchema });
const departmentUpdateSchema = departmentCreateSchema.partial().extend({ isActive: activeSchema });
const programCreateSchema = z.object({
  departmentId: idSchema,
  name: nameSchema,
  code: codeSchema,
});
const programUpdateSchema = programCreateSchema.partial().extend({ isActive: activeSchema });
const termFieldsSchema = z.object({
  name: nameSchema,
  code: codeSchema,
  startDate: dateSchema,
  endDate: dateSchema,
  isActive: activeSchema,
});
const termCreateSchema = termFieldsSchema.refine((value) => value.endDate >= value.startDate, {
  message: "endDate must be on or after startDate",
  path: ["endDate"],
});
const termUpdateSchema = termFieldsSchema.partial().superRefine((value, ctx) => {
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "endDate must be on or after startDate", path: ["endDate"] });
  }
});
const semesterFieldsSchema = z.object({
  academicTermId: idSchema,
  name: nameSchema,
  code: codeSchema,
  startDate: dateSchema,
  endDate: dateSchema,
  isActive: activeSchema,
});
const semesterCreateSchema = semesterFieldsSchema.refine((value) => value.endDate >= value.startDate, {
  message: "endDate must be on or after startDate",
  path: ["endDate"],
});
const semesterUpdateSchema = semesterFieldsSchema.partial().superRefine((value, ctx) => {
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "endDate must be on or after startDate", path: ["endDate"] });
  }
});
const sectionCreateSchema = z.object({
  programId: idSchema,
  semesterId: idSchema,
  name: nameSchema,
  code: codeSchema,
  isActive: activeSchema,
});
const sectionUpdateSchema = sectionCreateSchema.partial();

function organizationId(req: Parameters<typeof resolveOrganization>[0]): string {
  return req.user!.organizationId!;
}

function handleError(err: unknown, next: (error?: unknown) => void) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return next(Object.assign(new Error("A record with these details already exists"), { status: 409 }));
    }
    if (err.code === "P2025") {
      return next(Object.assign(new Error("Resource not found"), { status: 404 }));
    }
  }
  return next(err);
}

academicRouter.use(...adminMiddleware);

academicRouter.post("/departments", async (req, res, next) => {
  try {
    const input = departmentCreateSchema.parse(req.body);
    const department = await prisma.department.create({ data: { ...input, organizationId: organizationId(req) } });
    return res.status(201).json({ department });
  } catch (err) {
    return handleError(err, next);
  }
});

academicRouter.get("/departments", async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({ where: { organizationId: organizationId(req) }, orderBy: { name: "asc" } });
    return res.status(200).json({ departments });
  } catch (err) {
    return next(err);
  }
});

academicRouter.get("/departments/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const department = await prisma.department.findFirst({ where: { id, organizationId: organizationId(req) } });
    if (!department) return res.status(404).json({ error: "Resource not found" });
    return res.status(200).json({ department });
  } catch (err) {
    return next(err);
  }
});

academicRouter.patch("/departments/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const input = departmentUpdateSchema.parse(req.body);
    const current = await prisma.department.findFirst({ where: { id, organizationId: organizationId(req) } });
    if (!current) return res.status(404).json({ error: "Resource not found" });
    const department = await prisma.department.update({ where: { id }, data: input });
    return res.status(200).json({ department });
  } catch (err) {
    return handleError(err, next);
  }
});

academicRouter.delete("/departments/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const result = await prisma.department.updateMany({ where: { id, organizationId: organizationId(req) }, data: { isActive: false } });
    if (!result.count) return res.status(404).json({ error: "Resource not found" });
    const department = await prisma.department.findUniqueOrThrow({ where: { id } });
    return res.status(200).json({ department });
  } catch (err) {
    return handleError(err, next);
  }
});

academicRouter.post("/programs", async (req, res, next) => {
  try {
    const input = programCreateSchema.parse(req.body);
    const department = await prisma.department.findFirst({ where: { id: input.departmentId, organizationId: organizationId(req), isActive: true } });
    if (!department) return res.status(404).json({ error: "Resource not found" });
    const program = await prisma.program.create({ data: { ...input, organizationId: organizationId(req) } });
    return res.status(201).json({ program });
  } catch (err) {
    return handleError(err, next);
  }
});

academicRouter.get("/programs", async (req, res, next) => {
  try {
    const programs = await prisma.program.findMany({ where: { organizationId: organizationId(req) }, include: { department: { select: { id: true, name: true, code: true } } }, orderBy: { name: "asc" } });
    return res.status(200).json({ programs });
  } catch (err) {
    return next(err);
  }
});

academicRouter.get("/programs/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const program = await prisma.program.findFirst({ where: { id, organizationId: organizationId(req) }, include: { department: { select: { id: true, name: true, code: true } } } });
    if (!program) return res.status(404).json({ error: "Resource not found" });
    return res.status(200).json({ program });
  } catch (err) {
    return next(err);
  }
});

academicRouter.patch("/programs/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const input = programUpdateSchema.parse(req.body);
    const current = await prisma.program.findFirst({ where: { id, organizationId: organizationId(req) } });
    if (!current) return res.status(404).json({ error: "Resource not found" });
    if (input.departmentId) {
      const department = await prisma.department.findFirst({ where: { id: input.departmentId, organizationId: organizationId(req), isActive: true } });
      if (!department) return res.status(404).json({ error: "Resource not found" });
    }
    const program = await prisma.program.update({ where: { id }, data: input });
    return res.status(200).json({ program });
  } catch (err) {
    return handleError(err, next);
  }
});

academicRouter.delete("/programs/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const result = await prisma.program.updateMany({ where: { id, organizationId: organizationId(req) }, data: { isActive: false } });
    if (!result.count) return res.status(404).json({ error: "Resource not found" });
    const program = await prisma.program.findUniqueOrThrow({ where: { id } });
    return res.status(200).json({ program });
  } catch (err) {
    return handleError(err, next);
  }
});

academicRouter.post("/terms", async (req, res, next) => {
  try {
    const input = termCreateSchema.parse(req.body);
    const academicTerm = await prisma.academicTerm.create({ data: { ...input, organizationId: organizationId(req) } });
    return res.status(201).json({ academicTerm });
  } catch (err) {
    return handleError(err, next);
  }
});

academicRouter.get("/terms", async (req, res, next) => {
  try {
    const academicTerms = await prisma.academicTerm.findMany({ where: { organizationId: organizationId(req) }, orderBy: { startDate: "desc" } });
    return res.status(200).json({ academicTerms });
  } catch (err) {
    return next(err);
  }
});

academicRouter.get("/terms/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const academicTerm = await prisma.academicTerm.findFirst({ where: { id, organizationId: organizationId(req) } });
    if (!academicTerm) return res.status(404).json({ error: "Resource not found" });
    return res.status(200).json({ academicTerm });
  } catch (err) {
    return next(err);
  }
});

academicRouter.patch("/terms/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const input = termUpdateSchema.parse(req.body);
    const current = await prisma.academicTerm.findFirst({ where: { id, organizationId: organizationId(req) } });
    if (!current) return res.status(404).json({ error: "Resource not found" });
    const startDate = input.startDate ?? current.startDate;
    const endDate = input.endDate ?? current.endDate;
    if (endDate < startDate) return res.status(400).json({ error: "endDate must be on or after startDate" });
    const academicTerm = await prisma.academicTerm.update({ where: { id }, data: input });
    return res.status(200).json({ academicTerm });
  } catch (err) {
    return handleError(err, next);
  }
});

academicRouter.delete("/terms/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const result = await prisma.academicTerm.updateMany({ where: { id, organizationId: organizationId(req) }, data: { isActive: false } });
    if (!result.count) return res.status(404).json({ error: "Resource not found" });
    const academicTerm = await prisma.academicTerm.findUniqueOrThrow({ where: { id } });
    return res.status(200).json({ academicTerm });
  } catch (err) {
    return handleError(err, next);
  }
});

academicRouter.post("/semesters", async (req, res, next) => {
  try {
    const input = semesterCreateSchema.parse(req.body);
    const academicTerm = await prisma.academicTerm.findFirst({ where: { id: input.academicTermId, organizationId: organizationId(req), isActive: true } });
    if (!academicTerm) return res.status(404).json({ error: "Resource not found" });
    const semester = await prisma.semester.create({ data: { ...input, organizationId: organizationId(req) } });
    return res.status(201).json({ semester });
  } catch (err) {
    return handleError(err, next);
  }
});

academicRouter.get("/semesters", async (req, res, next) => {
  try {
    const semesters = await prisma.semester.findMany({ where: { organizationId: organizationId(req) }, include: { academicTerm: { select: { id: true, name: true, code: true } } }, orderBy: { startDate: "desc" } });
    return res.status(200).json({ semesters });
  } catch (err) {
    return next(err);
  }
});

academicRouter.get("/semesters/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const semester = await prisma.semester.findFirst({ where: { id, organizationId: organizationId(req) }, include: { academicTerm: { select: { id: true, name: true, code: true } } } });
    if (!semester) return res.status(404).json({ error: "Resource not found" });
    return res.status(200).json({ semester });
  } catch (err) {
    return next(err);
  }
});

academicRouter.patch("/semesters/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const input = semesterUpdateSchema.parse(req.body);
    const current = await prisma.semester.findFirst({ where: { id, organizationId: organizationId(req) } });
    if (!current) return res.status(404).json({ error: "Resource not found" });
    const startDate = input.startDate ?? current.startDate;
    const endDate = input.endDate ?? current.endDate;
    if (endDate < startDate) return res.status(400).json({ error: "endDate must be on or after startDate" });
    if (input.academicTermId) {
      const academicTerm = await prisma.academicTerm.findFirst({ where: { id: input.academicTermId, organizationId: organizationId(req), isActive: true } });
      if (!academicTerm) return res.status(404).json({ error: "Resource not found" });
    }
    const semester = await prisma.semester.update({ where: { id }, data: input });
    return res.status(200).json({ semester });
  } catch (err) {
    return handleError(err, next);
  }
});

academicRouter.delete("/semesters/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const result = await prisma.semester.updateMany({ where: { id, organizationId: organizationId(req) }, data: { isActive: false } });
    if (!result.count) return res.status(404).json({ error: "Resource not found" });
    const semester = await prisma.semester.findUniqueOrThrow({ where: { id } });
    return res.status(200).json({ semester });
  } catch (err) {
    return handleError(err, next);
  }
});

academicRouter.post("/sections", async (req, res, next) => {
  try {
    const input = sectionCreateSchema.parse(req.body);
    const [program, semester] = await Promise.all([
      prisma.program.findFirst({ where: { id: input.programId, organizationId: organizationId(req), isActive: true } }),
      prisma.semester.findFirst({ where: { id: input.semesterId, organizationId: organizationId(req), isActive: true } }),
    ]);
    if (!program || !semester) return res.status(404).json({ error: "Resource not found" });
    const section = await prisma.section.create({ data: { ...input, organizationId: organizationId(req) } });
    return res.status(201).json({ section });
  } catch (err) {
    return handleError(err, next);
  }
});

academicRouter.get("/sections", async (req, res, next) => {
  try {
    const sections = await prisma.section.findMany({ where: { organizationId: organizationId(req) }, include: { program: { select: { id: true, name: true, code: true } }, semester: { select: { id: true, name: true, code: true } } }, orderBy: { name: "asc" } });
    return res.status(200).json({ sections });
  } catch (err) {
    return next(err);
  }
});

academicRouter.get("/sections/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const section = await prisma.section.findFirst({ where: { id, organizationId: organizationId(req) }, include: { program: { select: { id: true, name: true, code: true } }, semester: { select: { id: true, name: true, code: true } } } });
    if (!section) return res.status(404).json({ error: "Resource not found" });
    return res.status(200).json({ section });
  } catch (err) {
    return next(err);
  }
});

academicRouter.patch("/sections/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const input = sectionUpdateSchema.parse(req.body);
    const current = await prisma.section.findFirst({ where: { id, organizationId: organizationId(req) } });
    if (!current) return res.status(404).json({ error: "Resource not found" });
    const nextProgramId = input.programId ?? current.programId;
    const nextSemesterId = input.semesterId ?? current.semesterId;
    const [program, semester] = await Promise.all([
      prisma.program.findFirst({ where: { id: nextProgramId, organizationId: organizationId(req), isActive: true } }),
      prisma.semester.findFirst({ where: { id: nextSemesterId, organizationId: organizationId(req), isActive: true } }),
    ]);
    if (!program || !semester) return res.status(404).json({ error: "Resource not found" });
    const section = await prisma.section.update({ where: { id }, data: input });
    return res.status(200).json({ section });
  } catch (err) {
    return handleError(err, next);
  }
});

academicRouter.delete("/sections/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const result = await prisma.section.updateMany({ where: { id, organizationId: organizationId(req) }, data: { isActive: false } });
    if (!result.count) return res.status(404).json({ error: "Resource not found" });
    const section = await prisma.section.findUniqueOrThrow({ where: { id } });
    return res.status(200).json({ section });
  } catch (err) {
    return handleError(err, next);
  }
});
