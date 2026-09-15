import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.routes";
import { organizationsRouter } from "./modules/organizations/organizations.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { academicRouter } from "./modules/academic/academic.routes";
import { phase3Router } from "./modules/phase3/phase3.routes";
import { attendanceRouter } from "./modules/attendance/attendance.routes";
import { biometricsRouter } from "./modules/biometrics/biometrics.routes";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
    })
  );
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "15mb" }));

  // Generous global limit; auth routes get a tighter one below to slow
  // credential-stuffing / brute force attempts.
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 1000 }));

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 });

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

  app.use("/api/v1/auth", authLimiter, authRouter);
  app.use("/api/v1/organizations", organizationsRouter);
  app.use("/api/v1/dashboard", dashboardRouter);
  app.use("/api/v1/academic", academicRouter);
  app.use("/api/v1/attendance", attendanceRouter);
  app.use("/api/v1/biometrics", biometricsRouter);
  app.use("/api/v1", phase3Router);

  app.use("/api/*", (_req, res) => res.status(404).json({ error: "API endpoint not found" }));
  app.use(errorHandler);

  return app;
}
