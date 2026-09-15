import { prisma } from "./prisma";
import { hashPassword } from "./password";
import { BiometricVerificationMode, AttendanceSessionStatus } from "@prisma/client";

export async function seedDatabase() {
  // Ensure connection is established before querying
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await prisma.$connect();
      break;
    } catch (e) {
      if (attempt === 6) {
        console.warn("Could not connect to database after retries:", e);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  const existingUser = await prisma.user.findFirst();
  if (existingUser) {
    console.log("Database already has users. Skipping seed.");
    return;
  }

  console.log("Seeding initial demo data for AttendAI...");
  const passwordHash = await hashPassword("Admin@12345");

  // 1. Get or Create Organization
  let org = await prisma.organization.findUnique({ where: { slug: "apex-tech" } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "Apex Institute of Technology",
        slug: "apex-tech",
        status: "ACTIVE",
      },
    });
  }

  // 2. Biometric Settings
  const existingSettings = await prisma.organizationBiometricSettings.findUnique({
    where: { organizationId: org.id },
  });
  if (!existingSettings) {
    await prisma.organizationBiometricSettings.create({
      data: {
        organizationId: org.id,
        verificationMode: BiometricVerificationMode.NORMAL,
        faceThreshold: 0.60,
        voiceThreshold: 0.65,
        livenessThreshold: 0.70,
        livenessChallengeCount: 2,
      },
    });
  }

  // 3. Academic Structure
  let dept = await prisma.department.findFirst({
    where: { organizationId: org.id, code: "CSE" },
  });
  if (!dept) {
    dept = await prisma.department.create({
      data: {
        organizationId: org.id,
        code: "CSE",
        name: "Computer Science & Engineering",
      },
    });
  }

  let prog = await prisma.program.findFirst({
    where: { organizationId: org.id, code: "BT-CSE" },
  });
  if (!prog) {
    prog = await prisma.program.create({
      data: {
        organizationId: org.id,
        departmentId: dept.id,
        code: "BT-CSE",
        name: "B.Tech Computer Science",
      },
    });
  }

  let term = await prisma.academicTerm.findFirst({
    where: { organizationId: org.id, code: "FALL26" },
  });
  if (!term) {
    term = await prisma.academicTerm.create({
      data: {
        organizationId: org.id,
        name: "Fall 2026",
        code: "FALL26",
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-12-31"),
        isActive: true,
      },
    });
  }

  let semester = await prisma.semester.findFirst({
    where: { academicTermId: term.id, code: "SEM5" },
  });
  if (!semester) {
    semester = await prisma.semester.create({
      data: {
        organizationId: org.id,
        academicTermId: term.id,
        name: "Semester 5",
        code: "SEM5",
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-12-31"),
        isActive: true,
      },
    });
  }

  let section = await prisma.section.findFirst({
    where: { organizationId: org.id, semesterId: semester.id, code: "SEC-A" },
  });
  if (!section) {
    section = await prisma.section.create({
      data: {
        organizationId: org.id,
        programId: prog.id,
        semesterId: semester.id,
        name: "Section A",
        code: "SEC-A",
        isActive: true,
      },
    });
  }

  // 4. Users
  let adminUser = await prisma.user.findUnique({ where: { email: "admin@apex.edu" } });
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: "admin@apex.edu",
        passwordHash,
        fullName: "Dr. Sarah Jenkins (Admin)",
        role: "ORG_ADMIN",
      },
    });
  }

  let hodUser = await prisma.user.findUnique({ where: { email: "hod@apex.edu" } });
  if (!hodUser) {
    hodUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: "hod@apex.edu",
        passwordHash,
        fullName: "Prof. Robert Vance (HOD)",
        role: "HOD",
      },
    });
  }

  let teacherUser = await prisma.user.findUnique({ where: { email: "teacher@apex.edu" } });
  if (!teacherUser) {
    teacherUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: "teacher@apex.edu",
        passwordHash,
        fullName: "Dr. Alan Turing (Faculty)",
        role: "TEACHER",
      },
    });
  }

  let teacher = await prisma.teacher.findFirst({
    where: { organizationId: org.id, userId: teacherUser.id },
  });
  if (!teacher) {
    teacher = await prisma.teacher.create({
      data: {
        organizationId: org.id,
        userId: teacherUser.id,
        departmentId: dept.id,
        employeeNumber: "EMP-1001",
        status: "ACTIVE",
      },
    });
  }

  let studentUser = await prisma.user.findUnique({ where: { email: "student@apex.edu" } });
  if (!studentUser) {
    studentUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: "student@apex.edu",
        passwordHash,
        fullName: "Alex Mercer (Student)",
        role: "STUDENT",
      },
    });
  }

  let student = await prisma.student.findFirst({
    where: { organizationId: org.id, userId: studentUser.id },
  });
  if (!student) {
    student = await prisma.student.create({
      data: {
        organizationId: org.id,
        userId: studentUser.id,
        departmentId: dept.id,
        programId: prog.id,
        currentSectionId: section.id,
        studentNumber: "STU-2026-001",
        status: "ACTIVE",
      },
    });
  }

  // 5. Courses & Offerings
  let course = await prisma.course.findFirst({
    where: { organizationId: org.id, code: "CS301" },
  });
  if (!course) {
    course = await prisma.course.create({
      data: {
        organizationId: org.id,
        departmentId: dept.id,
        code: "CS301",
        title: "Computer Vision & Biometrics",
        creditHours: 4,
        isActive: true,
      },
    });
  }

  let offering = await prisma.courseOffering.findFirst({
    where: {
      organizationId: org.id,
      courseId: course.id,
      semesterId: semester.id,
      sectionId: section.id,
    },
  });
  if (!offering) {
    offering = await prisma.courseOffering.create({
      data: {
        organizationId: org.id,
        courseId: course.id,
        academicTermId: term.id,
        programId: prog.id,
        semesterId: semester.id,
        sectionId: section.id,
        teacherId: teacher.id,
        isActive: true,
      },
    });
  }

  // 6. Student Enrollment
  const existingEnrollment = await prisma.studentEnrollment.findFirst({
    where: {
      organizationId: org.id,
      studentId: student.id,
      courseOfferingId: offering.id,
    },
  });
  if (!existingEnrollment) {
    await prisma.studentEnrollment.create({
      data: {
        organizationId: org.id,
        studentId: student.id,
        courseOfferingId: offering.id,
        sectionId: section.id,
        status: "ENROLLED",
      },
    });
  }

  // 7. Active Attendance Session
  const existingSession = await prisma.attendanceSession.findFirst({
    where: {
      organizationId: org.id,
      courseOfferingId: offering.id,
      teacherId: teacher.id,
    },
  });
  if (!existingSession) {
    const session = await prisma.attendanceSession.create({
      data: {
        organizationId: org.id,
        courseOfferingId: offering.id,
        teacherId: teacher.id,
        sessionDate: new Date(),
        title: "Lecture 1: Biometric Identity & CNNs",
        status: AttendanceSessionStatus.OPEN,
      },
    });
    console.log("Seeding successfully completed! Demo session ID:", session.id);
  } else {
    console.log("Seeding successfully completed! Existing session ID:", existingSession.id);
  }
}
