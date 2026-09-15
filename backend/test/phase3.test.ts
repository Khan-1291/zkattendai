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
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(options.headers ?? {}) } });
  return { response, body: (await response.json()) as T };
}
function body(value: unknown): RequestInit { return { body: JSON.stringify(value) }; }
function auth(user: { id: string; organizationId: string | null; role: Role }) { return { Authorization: `Bearer ${signAccessToken({ userId: user.id, organizationId: user.organizationId, role: user.role as never })}` }; }

async function createOrganization() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const organization = await prisma.organization.create({ data: { name: `Phase 3 Org ${suffix}`, slug: `phase3-${suffix}`, status: "ACTIVE" } });
  organizationIds.push(organization.id);
  return organization;
}

async function createUser(organizationId: string, role: Role = "ORG_ADMIN") {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { organizationId, fullName: `Phase 3 User ${suffix}`, email: `phase3-${suffix}@example.com`, passwordHash: await hashPassword("Password123!"), role } });
  userIds.push(user.id);
  return user;
}

async function academicFixture(organizationId: string) {
  const department = await prisma.department.create({ data: { organizationId, name: `Computing ${organizationId.slice(0, 4)}`, code: `C-${organizationId.slice(0, 4)}` } });
  const program = await prisma.program.create({ data: { organizationId, departmentId: department.id, name: `Computer Science ${organizationId.slice(0, 4)}`, code: `CS-${organizationId.slice(0, 4)}` } });
  const term = await prisma.academicTerm.create({ data: { organizationId, name: `2026-${organizationId.slice(0, 4)}`, code: `T-${organizationId.slice(0, 4)}`, startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") } });
  const semester = await prisma.semester.create({ data: { organizationId, academicTermId: term.id, name: `Fall ${organizationId.slice(0, 4)}`, code: `F-${organizationId.slice(0, 4)}`, startDate: new Date("2026-09-01"), endDate: new Date("2027-01-31") } });
  const section = await prisma.section.create({ data: { organizationId, programId: program.id, semesterId: semester.id, name: `Section A ${organizationId.slice(0, 4)}`, code: `A-${organizationId.slice(0, 4)}` } });
  const alternateSection = await prisma.section.create({ data: { organizationId, programId: program.id, semesterId: semester.id, name: `Section B ${organizationId.slice(0, 4)}`, code: `B-${organizationId.slice(0, 4)}` } });
  return { department, program, term, semester, section, alternateSection };
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
    await prisma.studentEnrollment.deleteMany({ where: scope });
    await prisma.courseOffering.deleteMany({ where: scope });
    await prisma.student.deleteMany({ where: scope });
    await prisma.teacher.deleteMany({ where: scope });
    await prisma.course.deleteMany({ where: scope });
    await prisma.section.deleteMany({ where: scope });
    await prisma.semester.deleteMany({ where: scope });
    await prisma.academicTerm.deleteMany({ where: scope });
    await prisma.program.deleteMany({ where: scope });
    await prisma.department.deleteMany({ where: scope });
  }
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  if (organizationIds.length) await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.$disconnect();
});

test("creates students, teachers, courses, offerings, and enrollments", async () => {
  const organization = await createOrganization();
  const admin = await createUser(organization.id);
  const fixture = await academicFixture(organization.id);
  const headers = auth(admin);

  const student = await request<{ student: { id: string; user: { email: string }; studentNumber: string } }>("/students", { method: "POST", headers, ...body({ fullName: "Student One", email: "student-one-phase3@example.com", password: "Password123!", studentNumber: "ST-001", departmentId: fixture.department.id, programId: fixture.program.id, currentSectionId: fixture.section.id }) });
  assert.equal(student.response.status, 201);
  assert.equal(student.body.student.user.email, "student-one-phase3@example.com");
  assert.equal("passwordHash" in student.body.student, false);
  userIds.push((await prisma.student.findUniqueOrThrow({ where: { id: student.body.student.id } })).userId);

  const teacher = await request<{ teacher: { id: string } }>("/teachers", { method: "POST", headers, ...body({ fullName: "Teacher One", email: "teacher-one-phase3@example.com", password: "Password123!", employeeNumber: "EMP-001", departmentId: fixture.department.id }) });
  assert.equal(teacher.response.status, 201);
  userIds.push((await prisma.teacher.findUniqueOrThrow({ where: { id: teacher.body.teacher.id } })).userId);

  const course = await request<{ course: { id: string } }>("/courses", { method: "POST", headers, ...body({ departmentId: fixture.department.id, code: "CS-301", title: "Data Structures", creditHours: 3 }) });
  assert.equal(course.response.status, 201);
  const offering = await request<{ offering: { id: string; sectionId: string } }>("/course-offerings", { method: "POST", headers, ...body({ courseId: course.body.course.id, academicTermId: fixture.term.id, programId: fixture.program.id, semesterId: fixture.semester.id, sectionId: fixture.section.id, teacherId: teacher.body.teacher.id }) });
  assert.equal(offering.response.status, 201);
  const enrollment = await request<{ enrollment: { id: string; sectionId: string } }>("/enrollments", { method: "POST", headers, ...body({ studentId: student.body.student.id, courseOfferingId: offering.body.offering.id }) });
  assert.equal(enrollment.response.status, 201);
  assert.equal(enrollment.body.enrollment.sectionId, fixture.section.id);
});

test("rejects duplicate profiles, courses, and enrollments", async () => {
  const organization = await createOrganization();
  const admin = await createUser(organization.id);
  const fixture = await academicFixture(organization.id);
  const headers = auth(admin);
  const studentInput = { fullName: "Duplicate Student", email: "duplicate-phase3@example.com", password: "Password123!", studentNumber: "DUP-001", departmentId: fixture.department.id, programId: fixture.program.id, currentSectionId: fixture.section.id };
  const firstStudent = await request<{ student: { id: string } }>("/students", { method: "POST", headers, ...body(studentInput) });
  assert.equal(firstStudent.response.status, 201);
  userIds.push((await prisma.student.findUniqueOrThrow({ where: { id: firstStudent.body.student.id } })).userId);
  const duplicateStudent = await request<{ error: string }>("/students", { method: "POST", headers, ...body({ ...studentInput, email: "duplicate-phase3-two@example.com" }) });
  assert.equal(duplicateStudent.response.status, 409);
  const courseInput = { departmentId: fixture.department.id, code: "DUP-301", title: "Duplicate Course", creditHours: 3 };
  assert.equal((await request("/courses", { method: "POST", headers, ...body(courseInput) })).response.status, 201);
  assert.equal((await request("/courses", { method: "POST", headers, ...body(courseInput) })).response.status, 409);
  const teacher = await request<{ teacher: { id: string } }>("/teachers", { method: "POST", headers, ...body({ fullName: "Duplicate Teacher", email: "duplicate-teacher-phase3@example.com", password: "Password123!", employeeNumber: "DUP-EMP", departmentId: fixture.department.id }) });
  userIds.push((await prisma.teacher.findUniqueOrThrow({ where: { id: teacher.body.teacher.id } })).userId);
  const course = await prisma.course.findFirstOrThrow({ where: { organizationId: organization.id, code: "DUP-301" } });
  const offering = await request<{ offering: { id: string } }>("/course-offerings", { method: "POST", headers, ...body({ courseId: course.id, academicTermId: fixture.term.id, programId: fixture.program.id, semesterId: fixture.semester.id, sectionId: fixture.section.id, teacherId: teacher.body.teacher.id }) });
  assert.equal(offering.response.status, 201);
  const enrollmentInput = { studentId: firstStudent.body.student.id, courseOfferingId: offering.body.offering.id };
  assert.equal((await request("/enrollments", { method: "POST", headers, ...body(enrollmentInput) })).response.status, 201);
  assert.equal((await request("/enrollments", { method: "POST", headers, ...body(enrollmentInput) })).response.status, 409);
});

test("rejects incompatible parents and preserves enrollment section history", async () => {
  const organization = await createOrganization();
  const admin = await createUser(organization.id);
  const fixture = await academicFixture(organization.id);
  const headers = auth(admin);
  const otherDepartment = await prisma.department.create({ data: { organizationId: organization.id, name: "Arts", code: `ART-${organization.id.slice(0, 4)}` } });
  const student = await request<{ student: { id: string } }>("/students", { method: "POST", headers, ...body({ fullName: "History Student", email: "history-phase3@example.com", password: "Password123!", studentNumber: "HIS-001", departmentId: fixture.department.id, programId: fixture.program.id, currentSectionId: fixture.section.id }) });
  userIds.push((await prisma.student.findUniqueOrThrow({ where: { id: student.body.student.id } })).userId);
  const teacher = await request<{ teacher: { id: string } }>("/teachers", { method: "POST", headers, ...body({ fullName: "History Teacher", email: "history-teacher-phase3@example.com", password: "Password123!", employeeNumber: "HIS-EMP", departmentId: fixture.department.id }) });
  userIds.push((await prisma.teacher.findUniqueOrThrow({ where: { id: teacher.body.teacher.id } })).userId);
  const course = await request<{ course: { id: string } }>("/courses", { method: "POST", headers, ...body({ departmentId: fixture.department.id, code: "HIS-301", title: "History Course", creditHours: 3 }) });
  const incompatible = await request<{ error: string }>("/course-offerings", { method: "POST", headers, ...body({ courseId: course.body.course.id, academicTermId: fixture.term.id, programId: fixture.program.id, semesterId: fixture.semester.id, sectionId: fixture.section.id, teacherId: teacher.body.teacher.id }) });
  assert.equal(incompatible.response.status, 201);
  const badCourse = await request<{ error: string }>("/courses", { method: "POST", headers, ...body({ departmentId: otherDepartment.id, code: "BAD-301", title: "Bad Parent", creditHours: 3 }) });
  assert.equal(badCourse.response.status, 201);
  const badOffering = await request<{ error: string }>("/course-offerings", { method: "POST", headers, ...body({ courseId: (await prisma.course.findFirstOrThrow({ where: { organizationId: organization.id, code: "BAD-301" } })).id, academicTermId: fixture.term.id, programId: fixture.program.id, semesterId: fixture.semester.id, sectionId: fixture.section.id, teacherId: teacher.body.teacher.id }) });
  assert.equal(badOffering.response.status, 400);
  const enrollment = await request<{ enrollment: { id: string; sectionId: string } }>("/enrollments", { method: "POST", headers, ...body({ studentId: student.body.student.id, courseOfferingId: incompatible.body ? (await prisma.courseOffering.findFirstOrThrow({ where: { organizationId: organization.id, courseId: course.body.course.id } })).id : "" }) });
  assert.equal(enrollment.response.status, 201);
  const moved = await request("/students/" + student.body.student.id, { method: "PATCH", headers, ...body({ currentSectionId: fixture.alternateSection.id }) });
  assert.equal(moved.response.status, 200);
  const stored = await request<{ enrollment: { sectionId: string } }>(`/enrollments/${enrollment.body.enrollment.id}`, { headers });
  assert.equal(stored.body.enrollment.sectionId, fixture.section.id);
});

test("enforces tenant isolation and teacher/student access restrictions", async () => {
  const organizationA = await createOrganization();
  const organizationB = await createOrganization();
  const adminA = await createUser(organizationA.id);
  const adminB = await createUser(organizationB.id);
  const teacherBUser = await createUser(organizationB.id, "TEACHER");
  const studentBUser = await createUser(organizationB.id, "STUDENT");
  const fixtureA = await academicFixture(organizationA.id);
  const fixtureB = await academicFixture(organizationB.id);
  const headersA = auth(adminA);
  const headersB = auth(adminB);
  const teacherB = await prisma.teacher.create({ data: { organizationId: organizationB.id, userId: teacherBUser.id, departmentId: fixtureB.department.id, employeeNumber: "ISO-TEACHER" } });
  const studentB = await prisma.student.create({ data: { organizationId: organizationB.id, userId: studentBUser.id, departmentId: fixtureB.department.id, programId: fixtureB.program.id, currentSectionId: fixtureB.section.id, studentNumber: "ISO-STUDENT" } });
  const courseB = await prisma.course.create({ data: { organizationId: organizationB.id, departmentId: fixtureB.department.id, code: "ISO-301", title: "Isolated Course", creditHours: 3 } });
  const offeringB = await prisma.courseOffering.create({ data: { organizationId: organizationB.id, courseId: courseB.id, academicTermId: fixtureB.term.id, programId: fixtureB.program.id, semesterId: fixtureB.semester.id, sectionId: fixtureB.section.id, teacherId: teacherB.id } });
  const enrollmentB = await prisma.studentEnrollment.create({ data: { organizationId: organizationB.id, studentId: studentB.id, courseOfferingId: offeringB.id, sectionId: fixtureB.section.id } });
  for (const path of [`/students/${studentB.id}`, `/teachers/${teacherB.id}`, `/courses/${courseB.id}`, `/course-offerings/${offeringB.id}`, `/enrollments/${enrollmentB.id}`]) {
    const result = await request<{ error: string }>(path, { headers: headersA });
    assert.equal(result.response.status, 404);
    assert.equal(result.body.error, "Resource not found");
  }
  const crossOffering = await request<{ error: string }>("/course-offerings", { method: "POST", headers: headersA, ...body({ courseId: courseB.id, academicTermId: fixtureA.term.id, programId: fixtureA.program.id, semesterId: fixtureA.semester.id, sectionId: fixtureA.section.id, teacherId: teacherB.id }) });
  assert.equal(crossOffering.response.status, 404);
  const crossEnrollment = await request<{ error: string }>("/enrollments", { method: "POST", headers: headersA, ...body({ studentId: studentB.id, courseOfferingId: offeringB.id }) });
  assert.equal(crossEnrollment.response.status, 404);
  const teacherForbidden = await request("/students", { headers: auth(teacherBUser) });
  assert.equal(teacherForbidden.response.status, 403);
  const studentForbidden = await request("/courses", { headers: auth(studentBUser) });
  assert.equal(studentForbidden.response.status, 403);
  const selfStudent = await request<{ student: { id: string } }>("/students/me", { headers: auth(studentBUser) });
  assert.equal(selfStudent.response.status, 200);
  const selfTeacher = await request<{ teacher: { id: string } }>("/teachers/me", { headers: auth(teacherBUser) });
  assert.equal(selfTeacher.response.status, 200);
  assert.equal(fixtureA.department.organizationId, organizationA.id);
});
