import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { Role } from "@prisma/client";
import { z } from "zod";

export interface AccessTokenPayload {
  userId: string;
  organizationId: string | null;
  role: Role;
}

const accessTokenSchema = z.object({
  userId: z.string().uuid(),
  organizationId: z.string().uuid().nullable(),
  role: z.nativeEnum(Role),
});

const refreshTokenSchema = z.object({
  userId: z.string().uuid(),
});

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpiresIn as SignOptions["expiresIn"],
  });
}

export function signRefreshToken(payload: { userId: string }): string {
  return jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn as SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return accessTokenSchema.parse(jwt.verify(token, env.jwtAccessSecret));
}

export function verifyRefreshToken(token: string): { userId: string } {
  return refreshTokenSchema.parse(jwt.verify(token, env.jwtRefreshSecret));
}
