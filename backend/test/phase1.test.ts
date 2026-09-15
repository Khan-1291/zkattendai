import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { after, before, test } from "node:test";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { signAccessToken } from "../src/lib/jwt";

let server: http.Server;
let baseUrl: string;
const createdOrganizationIds: string[] = [];
const createdUserIds: string[] = [];
const createdAuditLogIds: string[] = [];

async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const body = (await response.json()) as T;
  return { response, body };
}

function jsonBody(value: unknown): RequestInit {
  return { body: JSON.stringify(value) };
}

async function createOrganization(status: "ACTIVE" | "SUSPENDED" | "TRIAL" = "ACTIVE") {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const organization = await prisma.organization.create({
    data: {
      name: `Test Organization ${suffix}`,
      slug: `test-${suffix}`,
      status,
    },
  });
  createdOrganizationIds.push(organization.id);
  return organization;
}

async function createUser(
  organizationId: string | null,
  role: "SUPER_ADMIN" | "ORG_ADMIN" | "HOD" | "TEACHER" | "STUDENT" = "ORG_ADMIN",
  isActive = true
) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      organizationId,
      fullName: `Test User ${suffix}`,
      email: `test-${suffix}@example.com`,
      passwordHash: await hashPassword("Password123!"),
      role,
      isActive,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

function tokenFor(user: { id: string; organizationId: string | null; role: "SUPER_ADMIN" | "ORG_ADMIN" | "HOD" | "TEACHER" | "STUDENT" }) {
  return signAccessToken({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
  });
}

before(async () => {
  server = createApp().listen(0);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (createdAuditLogIds.length) {
    await prisma.auditLog.deleteMany({ where: { id: { in: createdAuditLogIds } } });
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  if (createdOrganizationIds.length) {
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
  }
  await prisma.$disconnect();
});

test("signup, login, and /auth/me work for a new organization", async () => {
  const email = `signup-${Date.now()}@example.com`;
  const signup = await request<{ accessToken: string; user: { id: string; organizationId: string } }>(
    "/auth/signup",
    { method: "POST", ...jsonBody({ organizationName: "Signup Test", adminFullName: "Signup User", adminEmail: email, adminPassword: "Password123!" }) }
  );

  assert.equal(signup.response.status, 201);
  assert.ok(signup.body.accessToken);
  createdUserIds.push(signup.body.user.id);
  createdOrganizationIds.push(signup.body.user.organizationId);

  const login = await request<{ accessToken: string }>("/auth/login", {
    method: "POST",
    ...jsonBody({ email, password: "Password123!" }),
  });
  assert.equal(login.response.status, 200);

  const me = await request<{ user: { email: string } }>("/auth/me", {
    headers: { Authorization: `Bearer ${login.body.accessToken}` },
  });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.user.email, email);
});

test("rejects invalid and expired access tokens", async () => {
  const invalid = await request<{ error: string }>("/auth/me", {
    headers: { Authorization: "Bearer invalid.token.value" },
  });
  assert.equal(invalid.response.status, 401);

  const user = await createUser(null, "SUPER_ADMIN");
  const expiredToken = (await import("jsonwebtoken")).default.sign(
    { userId: user.id, organizationId: null, role: user.role },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: -1 }
  );
  const result = await request<{ error: string }>("/auth/me", {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  assert.equal(result.response.status, 401);
});

test("enforces authentication and RBAC", async () => {
  const unauthenticated = await request<{ error: string }>("/organizations");
  assert.equal(unauthenticated.response.status, 401);

  const organization = await createOrganization();
  const user = await createUser(organization.id);
  const forbidden = await request<{ error: string }>("/organizations", {
    headers: { Authorization: `Bearer ${tokenFor(user)}` },
  });
  assert.equal(forbidden.response.status, 403);
});

test("scopes dashboard data to the authenticated organization", async () => {
  const organizationA = await createOrganization();
  const organizationB = await createOrganization();
  const userA = await createUser(organizationA.id);
  const userB = await createUser(organizationB.id);
  await createUser(organizationA.id, "TEACHER");

  const resultA = await request<{ organizationId: string; userCount: number }>("/dashboard/summary", {
    headers: { Authorization: `Bearer ${tokenFor(userA)}` },
  });
  const resultB = await request<{ organizationId: string; userCount: number }>("/dashboard/summary", {
    headers: { Authorization: `Bearer ${tokenFor(userB)}` },
  });

  assert.equal(resultA.response.status, 200);
  assert.equal(resultA.body.organizationId, organizationA.id);
  assert.equal(resultA.body.userCount, 2);
  assert.equal(resultB.body.organizationId, organizationB.id);
  assert.equal(resultB.body.userCount, 1);
});

test("blocks inactive users and suspended organizations", async () => {
  const inactiveOrganization = await createOrganization();
  const inactiveUser = await createUser(inactiveOrganization.id, "ORG_ADMIN", false);
  const inactiveLogin = await request<{ error: string }>("/auth/login", {
    method: "POST",
    ...jsonBody({ email: inactiveUser.email, password: "Password123!" }),
  });
  assert.equal(inactiveLogin.response.status, 401);

  const suspendedOrganization = await createOrganization("SUSPENDED");
  const suspendedUser = await createUser(suspendedOrganization.id);
  const suspendedLogin = await request<{ error: string }>("/auth/login", {
    method: "POST",
    ...jsonBody({ email: suspendedUser.email, password: "Password123!" }),
  });
  assert.equal(suspendedLogin.response.status, 403);

  const activeOrganization = await createOrganization();
  const activeUser = await createUser(activeOrganization.id);
  const activeToken = tokenFor(activeUser);
  await prisma.organization.update({ where: { id: activeOrganization.id }, data: { status: "SUSPENDED" } });
  const protectedResult = await request<{ error: string }>("/dashboard/summary", {
    headers: { Authorization: `Bearer ${activeToken}` },
  });
  assert.equal(protectedResult.response.status, 403);
});

test("validates and audits organization status updates", async () => {
  const organization = await createOrganization();
  const admin = await createUser(null, "SUPER_ADMIN");
  const token = tokenFor(admin);

  const invalid = await request<{ error: string }>(`/organizations/${organization.id}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    ...jsonBody({ status: "BROKEN" }),
  });
  assert.equal(invalid.response.status, 400);

  const update = await request<{ organization: { status: string } }>(`/organizations/${organization.id}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    ...jsonBody({ status: "SUSPENDED" }),
  });
  assert.equal(update.response.status, 200);
  assert.equal(update.body.organization.status, "SUSPENDED");

  const audit = await prisma.auditLog.findFirst({
    where: { organizationId: organization.id, action: "ORGANIZATION_STATUS_UPDATED" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(audit);
  createdAuditLogIds.push(audit.id);
  assert.equal(audit.actorUserId, admin.id);
  assert.deepEqual(audit.metadata, { status: "SUSPENDED" });
});
