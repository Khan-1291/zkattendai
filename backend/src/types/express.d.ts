import { Role } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        organizationId: string | null;
        role: Role;
      };
    }
  }
}

export {};
