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

async function fixture() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const organization = await prisma.organization.create({ data: { name: `Attendance Org ${suffix}`, slug: `attendance-${suffix}`, status: "ACTIVE" } });
  organizationIds.push(organization.id);
  const createUser = async (role: Role, label: string) => {
    const user = await prisma.user.create({ data: { organizationId: organization.id, fullName: `${label} ${suffix}`, email: `${label.toLowerCase()}-${suffix}@example.com`, passwordHash: await hashPassword("Password123!"), role } });
    userIds.push(user.id);
    return user;
  };
  const admin = await createUser("ORG_ADMIN", "Admin");
  const teacher = await createUser("TEACHER", "Teacher");
  const otherTeacherUser = await createUser("TEACHER", "OtherTeacher");
  const studentUser = await createUser("STUDENT", "Student");
  const otherStudentUser = await createUser("STUDENT", "OtherStudent");
  const department = await prisma.department.create({ data: { organizationId: organization.id, name: `Engineering ${suffix}`, code: `ENG-${suffix.slice(-8)}` } });
  const program = await prisma.program.create({ data: { organizationId: organization.id, departmentId: department.id, name: `Computer Science ${suffix}`, code: `CS-${suffix.slice(-8)}` } });
  const term = await prisma.academicTerm.create({ data: { organizationId: organization.id, name: `Term ${suffix}`, code: `T-${suffix.slice(-8)}`, startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") } });
  const semester = await prisma.semester.create({ data: { organizationId: organization.id, academicTermId: term.id, name: `Fall ${suffix}`, code: `F-${suffix.slice(-8)}`, startDate: new Date("2026-09-01"), endDate: new Date("2027-01-31") } });
  const section = await prisma.section.create({ data: { organizationId: organization.id, programId: program.id, semesterId: semester.id, name: `Section ${suffix}`, code: `A-${suffix.slice(-8)}` } });
  const otherSection = await prisma.section.create({ data: { organizationId: organization.id, programId: program.id, semesterId: semester.id, name: `Other Section ${suffix}`, code: `B-${suffix.slice(-8)}` } });
  const teacherProfile = await prisma.teacher.create({ data: { organizationId: organization.id, userId: teacher.id, departmentId: department.id, employeeNumber: `EMP-${suffix.slice(-8)}` } });
  const otherTeacherProfile = await prisma.teacher.create({ data: { organizationId: organization.id, userId: otherTeacherUser.id, departmentId: department.id, employeeNumber: `EMP2-${suffix.slice(-8)}` } });
  const student = await prisma.student.create({ data: { organizationId: organization.id, userId: studentUser.id, departmentId: department.id, programId: program.id, currentSectionId: section.id, studentNumber: `ST-${suffix.slice(-8)}` } });
  const otherStudent = await prisma.student.create({ data: { organizationId: organization.id, userId: otherStudentUser.id, departmentId: department.id, programId: program.id, currentSectionId: section.id, studentNumber: `ST2-${suffix.slice(-8)}` } });
  const course = await prisma.course.create({ data: { organizationId: organization.id, departmentId: department.id, code: `CS-${suffix.slice(-8)}`, title: "Data Structures", creditHours: 3 } });
  const offering = await prisma.courseOffering.create({ data: { organizationId: organization.id, courseId: course.id, academicTermId: term.id, programId: program.id, semesterId: semester.id, sectionId: section.id, teacherId: teacherProfile.id } });
  const otherOffering = await prisma.courseOffering.create({ data: { organizationId: organization.id, courseId: course.id, academicTermId: term.id, programId: program.id, semesterId: semester.id, sectionId: otherSection.id, teacherId: otherTeacherProfile.id } });
  const enrollment = await prisma.studentEnrollment.create({ data: { organizationId: organization.id, studentId: student.id, courseOfferingId: offering.id, sectionId: section.id } });
  const otherEnrollment = await prisma.studentEnrollment.create({ data: { organizationId: organization.id, studentId: otherStudent.id, courseOfferingId: offering.id, sectionId: section.id } });
  return { organization, admin, teacher, otherTeacherUser, studentUser, otherStudentUser, teacherProfile, otherTeacherProfile, student, otherStudent, department, program, term, semester, section, otherSection, course, offering, otherOffering, enrollment, otherEnrollment };
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
    await prisma.attendanceRecord.deleteMany({ where: scope });
    await prisma.attendanceSession.deleteMany({ where: scope });
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
    await prisma.auditLog.deleteMany({ where: scope });
  }
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  if (organizationIds.length) await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.$disconnect();
});

test("teacher creates only own offering sessions and rejects inactive offerings", async () => {
  const data = await fixture();
  const teacherHeaders = auth(data.teacher);
  const otherTeacherHeaders = auth(data.otherTeacherUser);
  const created = await request<{ session: { id: string; status: string } }>("/attendance/sessions", { method: "POST", headers: teacherHeaders, ...body({ courseOfferingId: data.offering.id, sessionDate: "2026-09-15T10:00:00.000Z", title: "Lecture 12" }) });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.session.status, "OPEN");
  const forbidden = await request<{ error: string }>("/attendance/sessions", { method: "POST", headers: otherTeacherHeaders, ...body({ courseOfferingId: data.offering.id, sessionDate: "2026-09-16T10:00:00.000Z" }) });
  assert.equal(forbidden.response.status, 404);
  await prisma.courseOffering.update({ where: { id: data.offering.id }, data: { isActive: false } });
  const inactive = await request<{ error: string }>("/attendance/sessions", { method: "POST", headers: teacherHeaders, ...body({ courseOfferingId: data.offering.id, sessionDate: "2026-09-17T10:00:00.000Z" }) });
  assert.equal(inactive.response.status, 404);
});

test("marks eligible attendance, rejects non-enrolled and duplicate records", async () => {
  const data = await fixture();
  const headers = auth(data.teacher);
  const session = await request<{ session: { id: string } }>("/attendance/sessions", { method: "POST", headers, ...body({ courseOfferingId: data.offering.id, sessionDate: "2026-09-15T10:00:00.000Z" }) });
  const eligible = await request<{ students: unknown[] }>(`/attendance/sessions/${session.body.session.id}/eligible-students`, { headers });
  assert.equal(eligible.response.status, 200);
  assert.equal(eligible.body.students.length, 2);
  const record = await request<{ record: { status: string } }>(`/attendance/sessions/${session.body.session.id}/records`, { method: "POST", headers, ...body({ studentId: data.student.id, status: "PRESENT" }) });
  assert.equal(record.response.status, 201);
  assert.equal(record.body.record.status, "PRESENT");
  const duplicate = await request<{ error: string }>(`/attendance/sessions/${session.body.session.id}/records`, { method: "POST", headers, ...body({ studentId: data.student.id, status: "LATE" }) });
  assert.equal(duplicate.response.status, 409);
  const nonEnrolled = await request<{ error: string }>(`/attendance/sessions/${session.body.session.id}/records`, { method: "POST", headers, ...body({ studentId: "00000000-0000-4000-8000-000000000001", status: "ABSENT" }) });
  assert.equal(nonEnrolled.response.status, 400);
});

test("closed sessions require admin override and audit the correction", async () => {
  const data = await fixture();
  const teacherHeaders = auth(data.teacher);
  const adminHeaders = auth(data.admin);
  const session = await request<{ session: { id: string } }>("/attendance/sessions", { method: "POST", headers: teacherHeaders, ...body({ courseOfferingId: data.offering.id, sessionDate: "2026-09-15T10:00:00.000Z" }) });
  await request(`/attendance/sessions/${session.body.session.id}/records`, { method: "POST", headers: teacherHeaders, ...body({ studentId: data.student.id, status: "PRESENT" }) });
  const closed = await request<{ session: { status: string } }>(`/attendance/sessions/${session.body.session.id}/close`, { method: "POST", headers: teacherHeaders });
  assert.equal(closed.body.session.status, "CLOSED");
  const record = await prisma.attendanceRecord.findFirstOrThrow({ where: { attendanceSessionId: session.body.session.id } });
  const teacherUpdate = await request<{ error: string }>(`/attendance/records/${record.id}`, { method: "PATCH", headers: teacherHeaders, ...body({ status: "ABSENT" }) });
  assert.equal(teacherUpdate.response.status, 403);
  const adminUpdate = await request<{ record: { status: string; verificationStatus: string } }>(`/attendance/records/${record.id}`, { method: "PATCH", headers: adminHeaders, ...body({ status: "LATE" }) });
  assert.equal(adminUpdate.response.status, 200);
  assert.equal(adminUpdate.body.record.verificationStatus, "MANUAL_OVERRIDE");
  const audit = await prisma.auditLog.findFirst({ where: { organizationId: data.organization.id, action: "ATTENDANCE_MANUAL_OVERRIDE", targetId: record.id }, orderBy: { createdAt: "desc" } });
  assert.ok(audit);
});

test("calculates percentage and preserves historical section context", async () => {
  const data = await fixture();
  const teacherHeaders = auth(data.teacher);
  const statuses = ["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const;
  let firstRecordId = "";
  for (const [index, status] of statuses.entries()) {
    const session = await request<{ session: { id: string } }>("/attendance/sessions", { method: "POST", headers: teacherHeaders, ...body({ courseOfferingId: data.offering.id, sessionDate: `2026-09-${15 + index}T10:00:00.000Z` }) });
    const record = await request<{ record: { id: string } }>(`/attendance/sessions/${session.body.session.id}/records`, { method: "POST", headers: teacherHeaders, ...body({ studentId: data.student.id, status }) });
    if (!firstRecordId) firstRecordId = record.body.record.id;
  }
  const studentHeaders = auth(data.studentUser);
  const percentage = await request<{ percentages: { percentage: number }[] }>(`/attendance/offerings/${data.offering.id}/percentage`, { headers: studentHeaders });
  assert.equal(percentage.response.status, 200);
  assert.equal(percentage.body.percentages[0].percentage, 66.67);
  await prisma.student.update({ where: { id: data.student.id }, data: { currentSectionId: data.otherSection.id } });
  const history = await request<{ records: { id: string; sectionId: string }[] }>("/attendance/students/me", { headers: studentHeaders });
  assert.equal(history.response.status, 200);
  assert.equal(history.body.records.find((record) => record.id === firstRecordId)?.sectionId, data.section.id);
});

test("isolates attendance data across organizations and blocks student writes", async () => {
  const a = await fixture();
  const b = await fixture();
  const sessionB = await request<{ session: { id: string } }>("/attendance/sessions", { method: "POST", headers: auth(b.teacher), ...body({ courseOfferingId: b.offering.id, sessionDate: "2026-09-15T10:00:00.000Z" }) });
  const cross = await request<{ error: string }>(`/attendance/sessions/${sessionB.body.session.id}`, { headers: auth(a.admin) });
  assert.equal(cross.response.status, 404);
  const studentWrite = await request<{ error: string }>("/attendance/sessions", { method: "POST", headers: auth(a.studentUser), ...body({ courseOfferingId: a.offering.id, sessionDate: "2026-09-15T10:00:00.000Z" }) });
  assert.equal(studentWrite.response.status, 403);
  const unauthenticated = await request<{ error: string }>("/attendance/sessions");
  assert.equal(unauthenticated.response.status, 401);
});
