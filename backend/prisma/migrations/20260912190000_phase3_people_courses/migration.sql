-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'GRADUATED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TeacherStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ENROLLED', 'DROPPED', 'COMPLETED', 'WITHDRAWN');

-- DropForeignKey
ALTER TABLE "programs" DROP CONSTRAINT "programs_department_id_fkey";
ALTER TABLE "sections" DROP CONSTRAINT "sections_program_id_fkey";

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "current_section_id" TEXT,
    "student_number" TEXT NOT NULL,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "employee_number" TEXT NOT NULL,
    "status" "TeacherStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "credit_hours" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_offerings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "academic_term_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "semester_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "course_offerings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_enrollments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_offering_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dropped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "students_organization_id_idx" ON "students"("organization_id");
CREATE INDEX "students_organization_id_department_id_idx" ON "students"("organization_id", "department_id");
CREATE INDEX "students_organization_id_program_id_idx" ON "students"("organization_id", "program_id");
CREATE INDEX "students_organization_id_current_section_id_idx" ON "students"("organization_id", "current_section_id");
CREATE UNIQUE INDEX "students_organization_id_id_key" ON "students"("organization_id", "id");
CREATE UNIQUE INDEX "students_organization_id_user_id_key" ON "students"("organization_id", "user_id");
CREATE UNIQUE INDEX "students_organization_id_student_number_key" ON "students"("organization_id", "student_number");
CREATE INDEX "teachers_organization_id_idx" ON "teachers"("organization_id");
CREATE INDEX "teachers_organization_id_department_id_idx" ON "teachers"("organization_id", "department_id");
CREATE UNIQUE INDEX "teachers_organization_id_id_key" ON "teachers"("organization_id", "id");
CREATE UNIQUE INDEX "teachers_organization_id_user_id_key" ON "teachers"("organization_id", "user_id");
CREATE UNIQUE INDEX "teachers_organization_id_employee_number_key" ON "teachers"("organization_id", "employee_number");
CREATE INDEX "courses_organization_id_idx" ON "courses"("organization_id");
CREATE INDEX "courses_organization_id_department_id_idx" ON "courses"("organization_id", "department_id");
CREATE UNIQUE INDEX "courses_organization_id_id_key" ON "courses"("organization_id", "id");
CREATE UNIQUE INDEX "courses_organization_id_code_key" ON "courses"("organization_id", "code");
CREATE INDEX "course_offerings_organization_id_idx" ON "course_offerings"("organization_id");
CREATE INDEX "course_offerings_organization_id_academic_term_id_idx" ON "course_offerings"("organization_id", "academic_term_id");
CREATE INDEX "course_offerings_organization_id_course_id_idx" ON "course_offerings"("organization_id", "course_id");
CREATE INDEX "course_offerings_organization_id_program_id_idx" ON "course_offerings"("organization_id", "program_id");
CREATE INDEX "course_offerings_organization_id_semester_id_idx" ON "course_offerings"("organization_id", "semester_id");
CREATE INDEX "course_offerings_organization_id_section_id_idx" ON "course_offerings"("organization_id", "section_id");
CREATE INDEX "course_offerings_organization_id_teacher_id_idx" ON "course_offerings"("organization_id", "teacher_id");
CREATE UNIQUE INDEX "course_offerings_organization_id_id_key" ON "course_offerings"("organization_id", "id");
CREATE UNIQUE INDEX "course_offerings_organization_id_course_id_semester_id_section_id_key" ON "course_offerings"("organization_id", "course_id", "semester_id", "section_id");
CREATE INDEX "student_enrollments_organization_id_idx" ON "student_enrollments"("organization_id");
CREATE INDEX "student_enrollments_organization_id_student_id_idx" ON "student_enrollments"("organization_id", "student_id");
CREATE INDEX "student_enrollments_organization_id_course_offering_id_idx" ON "student_enrollments"("organization_id", "course_offering_id");
CREATE INDEX "student_enrollments_organization_id_section_id_idx" ON "student_enrollments"("organization_id", "section_id");
CREATE UNIQUE INDEX "student_enrollments_organization_id_id_key" ON "student_enrollments"("organization_id", "id");
CREATE UNIQUE INDEX "student_enrollments_organization_id_student_id_course_offering_id_key" ON "student_enrollments"("organization_id", "student_id", "course_offering_id");
CREATE UNIQUE INDEX "academic_terms_organization_id_id_key" ON "academic_terms"("organization_id", "id");
CREATE UNIQUE INDEX "departments_organization_id_id_key" ON "departments"("organization_id", "id");
CREATE UNIQUE INDEX "programs_organization_id_id_key" ON "programs"("organization_id", "id");
CREATE UNIQUE INDEX "sections_organization_id_id_key" ON "sections"("organization_id", "id");
CREATE UNIQUE INDEX "sections_organization_id_id_semester_id_key" ON "sections"("organization_id", "id", "semester_id");
CREATE UNIQUE INDEX "semesters_organization_id_id_key" ON "semesters"("organization_id", "id");
CREATE UNIQUE INDEX "users_organization_id_id_key" ON "users"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_organization_id_department_id_fkey" FOREIGN KEY ("organization_id", "department_id") REFERENCES "departments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sections" ADD CONSTRAINT "sections_organization_id_program_id_fkey" FOREIGN KEY ("organization_id", "program_id") REFERENCES "programs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_organization_id_user_id_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_organization_id_department_id_fkey" FOREIGN KEY ("organization_id", "department_id") REFERENCES "departments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_organization_id_program_id_fkey" FOREIGN KEY ("organization_id", "program_id") REFERENCES "programs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_organization_id_current_section_id_fkey" FOREIGN KEY ("organization_id", "current_section_id") REFERENCES "sections"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_organization_id_user_id_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_organization_id_department_id_fkey" FOREIGN KEY ("organization_id", "department_id") REFERENCES "departments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "courses" ADD CONSTRAINT "courses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "courses" ADD CONSTRAINT "courses_organization_id_department_id_fkey" FOREIGN KEY ("organization_id", "department_id") REFERENCES "departments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_organization_id_course_id_fkey" FOREIGN KEY ("organization_id", "course_id") REFERENCES "courses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_organization_id_academic_term_id_fkey" FOREIGN KEY ("organization_id", "academic_term_id") REFERENCES "academic_terms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_organization_id_program_id_fkey" FOREIGN KEY ("organization_id", "program_id") REFERENCES "programs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_organization_id_semester_id_fkey" FOREIGN KEY ("organization_id", "semester_id") REFERENCES "semesters"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_organization_id_section_id_semester_id_fkey" FOREIGN KEY ("organization_id", "section_id", "semester_id") REFERENCES "sections"("organization_id", "id", "semester_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_organization_id_teacher_id_fkey" FOREIGN KEY ("organization_id", "teacher_id") REFERENCES "teachers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_organization_id_student_id_fkey" FOREIGN KEY ("organization_id", "student_id") REFERENCES "students"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_organization_id_course_offering_id_fkey" FOREIGN KEY ("organization_id", "course_offering_id") REFERENCES "course_offerings"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_organization_id_section_id_fkey" FOREIGN KEY ("organization_id", "section_id") REFERENCES "sections"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
