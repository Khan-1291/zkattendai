import { NextFunction, Request, Response } from "express";

/**
 * Guarantees that every non-super-admin request carries a resolved
 * organizationId (from the JWT, via `authenticate`) before it reaches a
 * tenant-scoped route. SUPER_ADMIN requests are platform-level and are
 * exempt — those routes must do their own explicit org lookups.
 *
 * Route handlers should use `req.user!.organizationId` directly for all
 * Prisma `where` clauses on tenant-owned tables. Never accept organizationId
 * from the request body/query/params.
 */
export function resolveOrganization(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (req.user.role === "SUPER_ADMIN") {
    return next();
  }

  if (!req.user.organizationId) {
    return res.status(403).json({ error: "Account is not attached to an organization" });
  }

  return next();
}
