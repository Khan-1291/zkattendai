import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import net from "net";
import express from "express";
import { createServer as createViteServer } from "vite";

// Load environment variables before any module loads
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });

function normalizeDatabaseUrl(): string {
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

normalizeDatabaseUrl();
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "dev_only_change_me_access_secret_key_attendai_32bytes";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "dev_only_change_me_refresh_secret_key_attendai_32bytes";
process.env.AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
process.env.PORT = "3000";

function isPortListening(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(600);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function ensureDatabaseRunning() {
  const isListening = await isPortListening(5432);
  if (isListening) {
    console.log("PostgreSQL database port 5432 is already active.");
    return;
  }

  console.log("Starting embedded PGlite PostgreSQL socket server on port 5432...");
  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");

  const dataDir = path.join(process.cwd(), ".pgdata");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const pg = new PGlite(dataDir);
  await pg.waitReady;

  const server = new PGLiteSocketServer({
    db: pg,
    port: 5432,
    host: "127.0.0.1",
    maxConnections: 100,
  });

  await server.start();
  console.log("PGlite socket server is ready and listening on 127.0.0.1:5432");
}

async function startServer() {
  const PORT = 3000;

  // 1. Ensure PGlite DB is running
  await ensureDatabaseRunning();

  // 2. Ensure initial seed data exists
  try {
    const { seedDatabase } = await import("./backend/src/lib/seedData");
    await seedDatabase();
  } catch (err) {
    console.warn("Database initialization notice:", err);
  }

  // 3. Create backend Express app with all API routes
  const { createApp } = await import("./backend/src/app");
  const app = createApp();

  // 4. Vite middleware for frontend development and SPA fallback
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AttendAI Server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal server start error:", err);
  process.exit(1);
});
