import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorizeRole } from "../../middleware/authorizeRole";
import { prisma } from "../../lib/prisma";
import { z } from "zod";

export const organizationsRouter = Router();

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "TRIAL"]),
});

// Platform-level: only the Super Admin can list every organization.
organizationsRouter.get(
  "/",
  authenticate,
  authorizeRole("SUPER_ADMIN"),
  async (_req, res, next) => {
    try {
      const organizations = await prisma.organization.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          _count: { select: { users: true } },
        },
      });
      res.status(200).json({ organizations });
    } catch (err) {
      next(err);
    }
  }
);

organizationsRouter.patch(
  "/:id/status",
  authenticate,
  authorizeRole("SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const { status } = statusSchema.parse(req.body);
      const organization = await prisma.$transaction(async (tx) => {
        const updated = await tx.organization.update({
          where: { id: req.params.id },
          data: { status },
        });

        await tx.auditLog.create({
          data: {
            organizationId: updated.id,
            actorUserId: req.user!.userId,
            action: "ORGANIZATION_STATUS_UPDATED",
            targetType: "Organization",
            targetId: updated.id,
            metadata: { status },
          },
        });

        return updated;
      });
      res.status(200).json({ organization });
    } catch (err) {
      next(err);
    }
  }
);
