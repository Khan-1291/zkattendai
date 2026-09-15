import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import { signAccessToken, signRefreshToken } from "../../lib/jwt";
import type { Prisma } from "@prisma/client";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base || "org";
  let suffix = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.organization.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

export interface SignupInput {
  organizationName: string;
  adminFullName: string;
  adminEmail: string;
  adminPassword: string;
}

/**
 * Onboarding flow (Section 23): a new organization signs up without
 * developer intervention. This creates the Organization AND its first
 * ORG_ADMIN user in a single transaction.
 */
export async function signupOrganization(input: SignupInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.adminEmail } });
  if (existing) {
    throw Object.assign(new Error("An account with this email already exists"), {
      status: 409,
    });
  }

  const slug = await uniqueSlug(slugify(input.organizationName));
  const passwordHash = await hashPassword(input.adminPassword);

  const { organization, user } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const organization = await tx.organization.create({
      data: {
        name: input.organizationName,
        slug,
        status: "TRIAL",
      },
    });

    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        fullName: input.adminFullName,
        email: input.adminEmail,
        passwordHash,
        role: "ORG_ADMIN",
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: organization.id,
        actorUserId: user.id,
        action: "ORGANIZATION_SIGNUP",
        targetType: "Organization",
        targetId: organization.id,
      },
    });

    return { organization, user };
  });

  return issueTokensFor(user.id, organization.id, "ORG_ADMIN");
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { organization: { select: { status: true } } },
  });

  if (!user || !user.isActive) {
    throw Object.assign(new Error("Invalid email or password"), { status: 401 });
  }

  if (user.organization?.status === "SUSPENDED") {
    throw Object.assign(new Error("Organization is suspended"), { status: 403 });
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw Object.assign(new Error("Invalid email or password"), { status: 401 });
  }

  return issueTokensFor(user.id, user.organizationId, user.role);
}

async function issueTokensFor(
  userId: string,
  organizationId: string | null,
  role: "SUPER_ADMIN" | "ORG_ADMIN" | "HOD" | "TEACHER" | "STUDENT"
) {
  const accessToken = signAccessToken({ userId, organizationId, role });
  const refreshToken = signRefreshToken({ userId });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      organizationId: true,
      organization: { select: { id: true, name: true, slug: true, status: true } },
    },
  });

  return { accessToken, refreshToken, user };
}
