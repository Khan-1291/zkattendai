import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as authService from "./auth.service";
import { prisma } from "../../lib/prisma";

const signupSchema = z.object({
  organizationName: z.string().min(2).max(120),
  adminFullName: z.string().min(2).max(120),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const input = signupSchema.parse(req.body);
    const result = await authService.signupOrganization(input);
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        organizationId: true,
        organization: { select: { id: true, name: true, slug: true, status: true } },
      },
    });
    return res.status(200).json({ user });
  } catch (err) {
    return next(err);
  }
}
