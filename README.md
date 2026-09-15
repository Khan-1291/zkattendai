# AttendAI — Multi-Tenant Smart Biometric Attendance System

AttendAI is an enterprise-grade, multi-tenant smart attendance platform combining facial recognition, acoustic speaker identification, active challenge-response liveness detection, and academic scheduling into an auditable attendance management SaaS.

---

## 1. System Architecture

The application is structured as a decoupled monorepo:

```
attendai/
├── backend/          Node.js 20 + Express + TypeScript + Prisma ORM (Port 4000)
├── ai-service/       Python 3.11 + FastAPI + InsightFace + OpenCV (Port 8000)
├── frontend/         React 18 + Vite + TypeScript + Tailwind CSS (Port 3000 / 5173)
├── prisma/           Multi-tenant relational schema with full database migrations
└── docker-compose.yml
```

### Core Technologies & AI Models
- **Facial Recognition**: InsightFace (`buffalo_s` model) generating 512-dimensional normalized facial embeddings.
- **Voice / Speaker Verification**: Acoustic speaker recognition generating 192-dimensional acoustic embedding vectors.
- **Liveness Detection**: Active challenge-response verification (head turn Left/Right, smile, blink, nod) computed via facial landmark geometry.
- **Template Security**: Encrypted-at-rest biometric template protection using **AES-256-GCM** with **PBKDF2 key derivation** (100,000 iterations, per-record cryptographically random 16-byte salt, 12-byte GCM nonce, and 128-bit authentication tag).
- **Backend & Database**: Node.js, Express, TypeScript, and PostgreSQL managed through Prisma ORM.

---

## 2. Security Model & Invariants

1. **Encrypted-at-Rest Biometric Protection (Not Zero-Knowledge)**:
   - Plaintext biometric embeddings are **never persisted**.
   - Biometric vectors are encrypted using AES-256-GCM prior to storage in `face_templates` and `voice_templates`.
   - Decryption occurs in volatile memory solely during vector similarity computation.
   - Note: The architecture provides encrypted-at-rest template protection; it is not zero-knowledge as the server performs the similarity evaluation.

2. **Stateless AI Processing & Raw Media Ephemerality**:
   - Camera video frames and microphone audio streams are processed in memory and immediately discarded.
   - Raw images, video recordings, and audio files are never persisted to disk or the relational database.
   - Audit logs store only session IDs, student IDs, outcome classifications, and timestamps—never biometric media.

3. **Strict Multi-Tenant Isolation**:
   - `organizationId` is enforced server-side exclusively from the cryptographically verified JWT access token.
   - Client-provided `organizationId` fields in HTTP request bodies, URL paths, or query parameters are strictly ignored.
   - Every database query scopes access by `organizationId`.

4. **Biometric Verification & Attendance Invariants**:
   - **Failed Biometric Verification**: Under no circumstances will a failed biometric check mark attendance as `PRESENT`. Failed attempts are recorded in `biometric_verification_attempts` and logged for auditing.
   - **Duplicate Attendance Prevention**: Attempting to verify attendance for a student who is already marked `PRESENT` or `LATE` in the active session returns `409 Conflict`.
   - **Mode Enforcement**:
     - **NORMAL Mode**: Requires Face Match ($\ge$ threshold) AND Liveness Pass ($\ge$ threshold).
     - **SECURE Mode**: Requires Face Match ($\ge$ threshold) AND Voice Speaker Match ($\ge$ threshold) AND Liveness Pass ($\ge$ threshold). Voice is strictly mandatory in SECURE mode; absence of voice sample results in verification failure.

---

## 3. API Surface

### Authentication & Multi-Tenancy (`/api/v1/auth`)
- `POST /api/v1/auth/signup` — Create new organization and initial `ORG_ADMIN`.
- `POST /api/v1/auth/login` — Authenticate and issue access + refresh tokens.
- `POST /api/v1/auth/refresh` — Rotate refresh token and issue new access token.
- `POST /api/v1/auth/logout` — Revoke active session tokens.

### Academic Management (`/api/v1`)
- `/api/v1/departments` — Department CRUD.
- `/api/v1/programs` — Academic program management.
- `/api/v1/terms` — Academic term definitions.
- `/api/v1/sections` — Class sections.
- `/api/v1/courses` — Course registry.
- `/api/v1/course-offerings` — Term offerings linked to teachers and sections.
- `/api/v1/students` — Student directory and enrollments.

### Attendance Engine (`/api/v1/attendance-sessions`, `/api/v1/attendance`)
- `POST /api/v1/attendance-sessions` — Create attendance session for course offering.
- `GET /api/v1/attendance-sessions/:id` — Session status and student roster.
- `PUT /api/v1/attendance-sessions/:id/close` — Finalize session and lock records.
- `POST /api/v1/attendance/mark` — Manual teacher/admin attendance override with audit trail.

### Biometric Engine (`/api/v1/biometrics`)
- `GET /api/v1/biometrics/challenge` — Retrieve dynamic active liveness challenge (`BLINK`, `SMILE`, `TURN_LEFT`, `TURN_RIGHT`, `NOD`).
- `POST /api/v1/biometrics/face/enroll` — Enroll 3–5 face image samples, validate quality, encrypt embeddings.
- `POST /api/v1/biometrics/voice/enroll` — Enroll voice audio sample, extract speaker vector, encrypt embedding.
- `POST /api/v1/biometrics/verify` — Real-time biometric attendance verification (Face + Liveness + optional/mandatory Voice).
- `GET /api/v1/biometrics/status/:studentId` — Biometric enrollment status for a student.
- `GET /api/v1/biometrics/settings` — Organization-wide biometric configuration (thresholds, mode).
- `PUT /api/v1/biometrics/settings` — Update thresholds and toggle NORMAL/SECURE mode (Admin/HOD).
- `DELETE /api/v1/biometrics/deactivate/:studentId` — GDPR compliance right-to-erasure for student biometric templates.

### Internal AI Microservice (`/`)
- `GET /health` — Service health check.
- `POST /face/embed` — Face detection, bounding box, quality score, and 512-dim embedding.
- `POST /voice/embed` — Audio decoding, duration check, and 192-dim speaker embedding.
- `POST /liveness/verify` — Active pose and expression challenge verification.

---

## 4. Running the Complete System

### Option A: Docker Compose (Production / Full Stack)

Requirements: Docker and Docker Compose.

```bash
# Clone the repository
git clone https://github.com/Khan-1291/attendai.git
cd attendai

# Build and start all 4 services
docker compose up --build
```

**Services and Ports:**
- **Frontend SPA**: `http://localhost:5173` (or port 3000 in containerized reverse proxy)
- **Backend API**: `http://localhost:4000` (Health: `http://localhost:4000/api/health`)
- **AI Service**: `http://localhost:8000` (Health: `http://localhost:8000/health`)
- **PostgreSQL Database**: `localhost:5432`

---

### Option B: Local Standalone Development

#### 1. PostgreSQL Database
Ensure a local or containerized PostgreSQL instance is running:
```bash
docker run --name attendai-db -e POSTGRES_USER=attendai -e POSTGRES_PASSWORD=attendai_dev_password -e POSTGRES_DB=attendai -p 5432:5432 -d postgres:16
```

#### 2. Backend Service
```bash
cd backend
npm install
cp .env.example .env
# Apply database migrations
npx prisma migrate deploy
# Run development server
npm run dev
```

#### 3. AI Microservice
```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### 4. Frontend Application
```bash
cd frontend
npm install
npm run dev
```

---

## 5. Testing & Verification

### Run Automated Backend & Security Tests
```bash
# Run unit tests (Biometric crypto, PBKDF2, AES-256-GCM, JWT, RBAC, Multi-tenant isolation)
./backend/node_modules/.bin/tsx --test backend/test/biometrics.unit.test.ts backend/test/security.unit.test.ts

# Run database integration tests (requires running PostgreSQL on localhost:5432)
npm --prefix backend test
```

### Validate Database Schema
```bash
DATABASE_URL="postgresql://attendai:attendai_dev_password@localhost:5432/attendai" npx prisma validate --schema=backend/prisma/schema.prisma
```
