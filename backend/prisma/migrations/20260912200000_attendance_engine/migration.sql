-- CreateEnum
CREATE TYPE "AttendanceSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "AttendanceVerificationMethod" AS ENUM ('MANUAL', 'FACE', 'VOICE', 'FACE_VOICE', 'FACE_VOICE_LIVENESS');

-- CreateEnum
CREATE TYPE "AttendanceVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'MANUAL_OVERRIDE');

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "course_offering_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "session_date" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "notes" TEXT,
    "status" "AttendanceSessionStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "attendance_session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'ABSENT',
    "verification_method" "AttendanceVerificationMethod" NOT NULL DEFAULT 'MANUAL',
    "verification_status" "AttendanceVerificationStatus" NOT NULL DEFAULT 'MANUAL_OVERRIDE',
    "verified_at" TIMESTAMP(3),
    "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_sessions_organization_id_idx" ON "attendance_sessions"("organization_id");
CREATE INDEX "attendance_sessions_organization_id_course_offering_id_idx" ON "attendance_sessions"("organization_id", "course_offering_id");
CREATE INDEX "attendance_sessions_organization_id_teacher_id_idx" ON "attendance_sessions"("organization_id", "teacher_id");
CREATE INDEX "attendance_sessions_organization_id_session_date_idx" ON "attendance_sessions"("organization_id", "session_date");
CREATE UNIQUE INDEX "attendance_sessions_organization_id_id_key" ON "attendance_sessions"("organization_id", "id");
CREATE INDEX "attendance_records_organization_id_idx" ON "attendance_records"("organization_id");
CREATE INDEX "attendance_records_organization_id_attendance_session_id_idx" ON "attendance_records"("organization_id", "attendance_session_id");
CREATE INDEX "attendance_records_organization_id_student_id_idx" ON "attendance_records"("organization_id", "student_id");
CREATE INDEX "attendance_records_organization_id_enrollment_id_idx" ON "attendance_records"("organization_id", "enrollment_id");
CREATE INDEX "attendance_records_organization_id_section_id_idx" ON "attendance_records"("organization_id", "section_id");
CREATE UNIQUE INDEX "attendance_records_organization_id_id_key" ON "attendance_records"("organization_id", "id");
CREATE UNIQUE INDEX "attendance_records_organization_id_attendance_session_id_student_id_key" ON "attendance_records"("organization_id", "attendance_session_id", "student_id");

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_organization_id_course_offering_id_fkey" FOREIGN KEY ("organization_id", "course_offering_id") REFERENCES "course_offerings"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_organization_id_teacher_id_fkey" FOREIGN KEY ("organization_id", "teacher_id") REFERENCES "teachers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organization_id_attendance_session_id_fkey" FOREIGN KEY ("organization_id", "attendance_session_id") REFERENCES "attendance_sessions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organization_id_student_id_fkey" FOREIGN KEY ("organization_id", "student_id") REFERENCES "students"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organization_id_enrollment_id_fkey" FOREIGN KEY ("organization_id", "enrollment_id") REFERENCES "student_enrollments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organization_id_section_id_fkey" FOREIGN KEY ("organization_id", "section_id") REFERENCES "sections"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep the existing Phase 3 schema's generated index names aligned with Prisma.
ALTER INDEX "course_offerings_organization_id_course_id_semester_id_section_" RENAME TO "course_offerings_organization_id_course_id_semester_id_sect_key";
ALTER INDEX "student_enrollments_organization_id_student_id_course_offering_" RENAME TO "student_enrollments_organization_id_student_id_course_offer_key";
