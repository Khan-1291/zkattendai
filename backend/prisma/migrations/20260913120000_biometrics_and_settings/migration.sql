-- CreateEnum
CREATE TYPE "BiometricVerificationMode" AS ENUM ('NORMAL', 'SECURE');

-- CreateTable
CREATE TABLE "organization_biometric_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "verification_mode" "BiometricVerificationMode" NOT NULL DEFAULT 'NORMAL',
    "face_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.60,
    "voice_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.65,
    "liveness_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.70,
    "liveness_challenge_count" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_biometric_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_enrollments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "face_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "face_enrollment_id" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "model_version" TEXT NOT NULL DEFAULT '1.0',
    "embedding_dimension" INTEGER NOT NULL DEFAULT 512,
    "encrypted_embedding" TEXT NOT NULL,
    "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_enrollments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "voice_enrollment_id" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "model_version" TEXT NOT NULL DEFAULT '1.0',
    "embedding_dimension" INTEGER NOT NULL DEFAULT 192,
    "encrypted_embedding" TEXT NOT NULL,
    "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_verification_attempts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "attendance_session_id" TEXT,
    "student_id" TEXT NOT NULL,
    "verification_mode" TEXT NOT NULL,
    "face_score" DOUBLE PRECISION,
    "face_pass" BOOLEAN NOT NULL,
    "liveness_score" DOUBLE PRECISION,
    "liveness_pass" BOOLEAN NOT NULL,
    "voice_score" DOUBLE PRECISION,
    "voice_pass" BOOLEAN,
    "overall_pass" BOOLEAN NOT NULL,
    "rejection_reason" TEXT,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biometric_verification_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_biometric_settings_organization_id_key" ON "organization_biometric_settings"("organization_id");

-- CreateIndex
CREATE INDEX "face_enrollments_organization_id_idx" ON "face_enrollments"("organization_id");
CREATE INDEX "face_enrollments_organization_id_student_id_idx" ON "face_enrollments"("organization_id", "student_id");
CREATE UNIQUE INDEX "face_enrollments_organization_id_id_key" ON "face_enrollments"("organization_id", "id");

-- CreateIndex
CREATE INDEX "face_templates_organization_id_idx" ON "face_templates"("organization_id");
CREATE INDEX "face_templates_face_enrollment_id_idx" ON "face_templates"("face_enrollment_id");

-- CreateIndex
CREATE INDEX "voice_enrollments_organization_id_idx" ON "voice_enrollments"("organization_id");
CREATE INDEX "voice_enrollments_organization_id_student_id_idx" ON "voice_enrollments"("organization_id", "student_id");
CREATE UNIQUE INDEX "voice_enrollments_organization_id_id_key" ON "voice_enrollments"("organization_id", "id");

-- CreateIndex
CREATE INDEX "voice_templates_organization_id_idx" ON "voice_templates"("organization_id");
CREATE INDEX "voice_templates_voice_enrollment_id_idx" ON "voice_templates"("voice_enrollment_id");

-- CreateIndex
CREATE INDEX "biometric_verification_attempts_organization_id_idx" ON "biometric_verification_attempts"("organization_id");
CREATE INDEX "biometric_verification_attempts_organization_id_student_id_idx" ON "biometric_verification_attempts"("organization_id", "student_id");
CREATE INDEX "biometric_verification_attempts_organization_id_attendance__idx" ON "biometric_verification_attempts"("organization_id", "attendance_session_id");
CREATE INDEX "biometric_verification_attempts_created_at_idx" ON "biometric_verification_attempts"("created_at");

-- AddForeignKey
ALTER TABLE "organization_biometric_settings" ADD CONSTRAINT "organization_biometric_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_enrollments" ADD CONSTRAINT "face_enrollments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "face_enrollments" ADD CONSTRAINT "face_enrollments_organization_id_student_id_fkey" FOREIGN KEY ("organization_id", "student_id") REFERENCES "students"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_templates" ADD CONSTRAINT "face_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "face_templates" ADD CONSTRAINT "face_templates_face_enrollment_id_fkey" FOREIGN KEY ("face_enrollment_id") REFERENCES "face_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_enrollments" ADD CONSTRAINT "voice_enrollments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voice_enrollments" ADD CONSTRAINT "voice_enrollments_organization_id_student_id_fkey" FOREIGN KEY ("organization_id", "student_id") REFERENCES "students"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_templates" ADD CONSTRAINT "voice_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voice_templates" ADD CONSTRAINT "voice_templates_voice_enrollment_id_fkey" FOREIGN KEY ("voice_enrollment_id") REFERENCES "voice_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_verification_attempts" ADD CONSTRAINT "biometric_verification_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "biometric_verification_attempts" ADD CONSTRAINT "biometric_verification_attempts_organization_id_attendance__fkey" FOREIGN KEY ("organization_id", "attendance_session_id") REFERENCES "attendance_sessions"("organization_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "biometric_verification_attempts" ADD CONSTRAINT "biometric_verification_attempts_organization_id_student_id_fkey" FOREIGN KEY ("organization_id", "student_id") REFERENCES "students"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
