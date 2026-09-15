import dotenv from "dotenv";
import path from "path";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

function getResolvedDatabaseUrl(): string {
  let url = process.env.DATABASE_URL || "";
  if (!url || url.includes("@db:") || url.includes("attendai:129120@db")) {
    url = "postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public&sslmode=disable&pgbouncer=true";
  }
  if (!url.includes("pgbouncer=true")) {
    url += (url.includes("?") ? "&" : "?") + "pgbouncer=true";
  }
  if (!url.includes("sslmode=")) {
    url += (url.includes("?") ? "&" : "?") + "sslmode=disable";
  }
  process.env.DATABASE_URL = url;
  return url;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: getResolvedDatabaseUrl(),
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  aiServiceUrl: process.env.AI_SERVICE_URL ?? "http://localhost:8000",
  aiServiceToken: process.env.AI_SERVICE_TOKEN ?? "attendai-internal-service-token-secret",
  biometricEncryptionKey: process.env.BIOMETRIC_ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  faceThreshold: Number(process.env.FACE_SIMILARITY_THRESHOLD ?? 0.60),
  voiceThreshold: Number(process.env.VOICE_SIMILARITY_THRESHOLD ?? 0.65),
  livenessThreshold: Number(process.env.LIVENESS_THRESHOLD ?? 0.70),
};
