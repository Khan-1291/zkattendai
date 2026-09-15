import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { resolveOrganization } from "../../middleware/resolveOrganization";
import { prisma } from "../../lib/prisma";

export const dashboardRouter = Router();

/**
 * Returns role-appropriate summary stats. Every query below is filtered by
 * req.user.organizationId (never a client-supplied value) — this is the
 * pattern every future tenant-scoped module (students, courses, attendance,
 * reports, etc.) must follow.
 */
dashboardRouter.get("/summary", authenticate, resolveOrganization, async (req, res, next) => {
  try {
    const { role, organizationId } = req.user!;

    if (role === "SUPER_ADMIN") {
      const [organizationCount, userCount] = await Promise.all([
        prisma.organization.count(),
        prisma.user.count(),
      ]);
      return res.status(200).json({
        scope: "PLATFORM",
        organizationCount,
        userCount,
      });
    }

    // Every other role is scoped to their own organization only.
    const userCount = await prisma.user.count({ where: { organizationId } });
    const roleBreakdown = await prisma.user.groupBy({
      by: ["role"],
      where: { organizationId },
      _count: true,
    });

    return res.status(200).json({
      scope: "ORGANIZATION",
      organizationId,
      userCount,
      roleBreakdown: roleBreakdown.map((r: { role: string; _count: number }) => ({
        role: r.role,
        count: r._count,
      })),
      // Placeholders — populated once Phase 2 (academic structure) and
      // Phase 4 (attendance) land, per the 8-week roadmap.
      totalStudents: 0,
      totalTeachers: 0,
      todaysAttendance: null,
    });
  } catch (err) {
    next(err);
  }
});
