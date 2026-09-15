import { PrismaClient } from "@prisma/client";

function getResolvedDatabaseUrl(): string {
  let url = process.env.DATABASE_URL || "";
  // If the URL is missing, points to the unreachable Docker 'db' hostname, or isn't local loopback
  if (!url || url.includes("@db:") || url.includes("attendai:129120@db")) {
    url = "postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public&sslmode=disable&pgbouncer=true";
  }
  // Ensure necessary parameters for PGlite connection
  if (!url.includes("pgbouncer=true")) {
    url += (url.includes("?") ? "&" : "?") + "pgbouncer=true";
  }
  if (!url.includes("sslmode=")) {
    url += (url.includes("?") ? "&" : "?") + "sslmode=disable";
  }
  return url;
}

const resolvedUrl = getResolvedDatabaseUrl();
process.env.DATABASE_URL = resolvedUrl;

// Single shared Prisma instance. Every tenant-scoped query in the app should
// go through the repository helpers in modules/*, which always filter by
// organizationId taken from the authenticated request — never from client input.
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: resolvedUrl,
    },
  },
});
