import { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";

/**
 * Restricts a route to a set of roles. Must run after `authenticate`.
 * Usage: router.get("/x", authenticate, authorizeRole("ORG_ADMIN", "HOD"), handler)
 */
export function authorizeRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to perform this action" });
    }

    return next();
  };
}
