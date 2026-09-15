import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { after, before, test } from "node:test";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { signAccessToken } from "../src/lib/jwt";

type Role = "SUPER_ADMIN" | "ORG_ADMIN" | "HOD" | "TEACHER" | "STUDENT";
let server: http.Server;
let baseUrl: string;
const organizationIds: string[] = [];
const userIds: string[] = [];

async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  return { response, body: (await response.json()) as T };
}

function body(value: unknown): RequestInit { return { body: JSON.stringify(value) }; }

async function organization() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const value = await prisma.organization.create({ data: { name: `Academic Org ${suffix}`, slug: `academic-${suffix}`, status: "ACTIVE" } });
  organizationIds.push(value.id);
  return value;
}

async function user(organizationId: string, role: Role = "ORG_ADMIN") {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const value = await prisma.user.create({
    data: { organizationId, fullName: `Academic User ${suffix}`, email: `academic-${suffix}@example.com`, passwordHash: await hashPassword("Password123!"), role },
  });
  userIds.push(value.id);
  return value;
}

function auth(userValue: { id: string; organizationId: string | null; role: Role }) {
  return { Authorization: `Bearer ${signAccessToken({ userId: userValue.id, organizationId: userValue.organizationId, role: userValue.role as never })}` };
}

before(async () => {
  server = createApp().listen(0);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (organizationIds.length) {
    const scope = { organizationId: { in: organizationIds } };
    await prisma.section.deleteMany({ where: scope });
    await prisma.semester.deleteMany({ where: scope });
    await prisma.program.deleteMany({ where: scope });
    await prisma.academicTerm.deleteMany({ where: scope });
    await prisma.department.deleteMany({ where: scope });
  }
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  if (organizationIds.length) await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.$disconnect();
});

test("creates and lists the complete academic structure", async () => {
  const org = await organization();
  const admin = await user(org.id);
  const headers = auth(admin);

  const department = await request<{ department: { id: string } }>("/academic/departments", { method: "POST", headers, ...body({ name: "Engineering", code: "ENG" }) });
  assert.equal(department.response.status, 201);
  const program = await request<{ program: { id: string } }>("/academic/programs", { method: "POST", headers, ...body({ departmentId: department.body.department.id, name: "Computer Science", code: "CS" }) });
  assert.equal(program.response.status, 201);
  const term = await request<{ academicTerm: { id: string } }>("/academic/terms", { method: "POST", headers, ...body({ name: "2026-2027", code: "2026-27", startDate: "2026-09-01", endDate: "2027-06-30" }) });
  assert.equal(term.response.status, 201);
  const semester = await request<{ semester: { id: string } }>("/academic/semesters", { method: "POST", headers, ...body({ academicTermId: term.body.academicTerm.id, name: "Fall", code: "FALL", startDate: "2026-09-01", endDate: "2027-01-31" }) });
  assert.equal(semester.response.status, 201);
  const section = await request<{ section: { id: string } }>("/academic/sections", { method: "POST", headers, ...body({ programId: program.body.program.id, semesterId: semester.body.semester.id, name: "Section A", code: "A" }) });
  assert.equal(section.response.status, 201);

  const listed = await request<{ departments: unknown[] }>("/academic/departments", { headers });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.departments.length, 1);

  const updated = await request<{ department: { name: string } }>(`/academic/departments/${department.body.department.id}`, { method: "PATCH", headers, ...body({ name: "Engineering and Computing" }) });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.department.name, "Engineering and Computing");
});

test("rejects duplicates and invalid academic input", async () => {
  const org = await organization();
  const admin = await user(org.id);
  const headers = auth(admin);
  const first = await request<{ department: { id: string } }>("/academic/departments", { method: "POST", headers, ...body({ name: "Science", code: "SCI" }) });
  assert.equal(first.response.status, 201);
  const duplicate = await request<{ error: string }>("/academic/departments", { method: "POST", headers, ...body({ name: "Science", code: "SCI-2" }) });
  assert.equal(duplicate.response.status, 409);
  const invalid = await request<{ details: unknown[] }>("/academic/terms", { method: "POST", headers, ...body({ name: "Bad term", code: "BAD", startDate: "2027-02-01", endDate: "2027-01-01" }) });
  assert.equal(invalid.response.status, 400);
});

test("requires authentication and restricts academic RBAC", async () => {
  const unauthenticated = await request<{ error: string }>("/academic/departments");
  assert.equal(unauthenticated.response.status, 401);
  const org = await organization();
  const teacher = await user(org.id, "TEACHER");
  const forbidden = await request<{ error: string }>("/academic/departments", { headers: auth(teacher) });
  assert.equal(forbidden.response.status, 403);
  const hod = await user(org.id, "HOD");
  const allowed = await request<{ departments: unknown[] }>("/academic/departments", { headers: auth(hod) });
  assert.equal(allowed.response.status, 200);
});

test("isolates every academic resource across organizations", async () => {
  const orgA = await organization();
  const orgB = await organization();
  const adminA = await user(orgA.id);
  const adminB = await user(orgB.id);
  const headersA = auth(adminA);
  const headersB = auth(adminB);

  const department = await request<{ department: { id: string } }>("/academic/departments", { method: "POST", headers: headersA, ...body({ name: "Business", code: "BUS" }) });
  const program = await request<{ program: { id: string } }>("/academic/programs", { method: "POST", headers: headersA, ...body({ departmentId: department.body.department.id, name: "Accounting", code: "ACC" }) });
  const term = await request<{ academicTerm: { id: string } }>("/academic/terms", { method: "POST", headers: headersA, ...body({ name: "2026", code: "26", startDate: "2026-01-01", endDate: "2026-12-31" }) });
  const semester = await request<{ semester: { id: string } }>("/academic/semesters", { method: "POST", headers: headersA, ...body({ academicTermId: term.body.academicTerm.id, name: "Annual", code: "ANN", startDate: "2026-01-01", endDate: "2026-12-31" }) });
  const section = await request<{ section: { id: string } }>("/academic/sections", { method: "POST", headers: headersA, ...body({ programId: program.body.program.id, semesterId: semester.body.semester.id, name: "Main", code: "MAIN" }) });

  const resources = [
    `/academic/departments/${department.body.department.id}`,
    `/academic/programs/${program.body.program.id}`,
    `/academic/terms/${term.body.academicTerm.id}`,
    `/academic/semesters/${semester.body.semester.id}`,
    `/academic/sections/${section.body.section.id}`,
  ];
  for (const path of resources) {
    const result = await request<{ error: string }>(path, { headers: headersB });
    assert.equal(result.response.status, 404);
    assert.equal(result.body.error, "Resource not found");
  }

  const update = await request<{ error: string }>(resources[0], { method: "PATCH", headers: headersB, ...body({ name: "Leaked" }) });
  assert.equal(update.response.status, 404);
  const remove = await request<{ error: string }>(resources[0], { method: "DELETE", headers: headersB });
  assert.equal(remove.response.status, 404);
});
