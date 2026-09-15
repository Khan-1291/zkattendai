import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";

/**
 * Verifies the access token and attaches the decoded identity to req.user.
 * This is the ONLY place organizationId enters the request lifecycle from a
 * trusted source (the signed token) — every downstream handler must read
 * req.user.organizationId, and must never read organizationId from
 * req.body / req.query / req.params.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        isActive: true,
        organizationId: true,
        organization: { select: { status: true } },
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Account is inactive or no longer exists" });
    }

    if (user.organization?.status === "SUSPENDED") {
      return res.status(403).json({ error: "Organization is suspended" });
    }

    req.user = {
      userId: payload.userId,
      organizationId: user.organizationId,
      role: payload.role,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
