import { useEffect, useState } from "react";
import { Sidebar } from "../components/Sidebar";
import { useAuth } from "../lib/auth-context";
import { api, ApiError } from "../lib/api";

interface PlatformSummary {
  scope: "PLATFORM";
  organizationCount: number;
  userCount: number;
}

interface OrgSummary {
  scope: "ORGANIZATION";
  organizationId: string;
  userCount: number;
  roleBreakdown: { role: string; count: number }[];
  totalStudents: number;
  totalTeachers: number;
  todaysAttendance: number | null;
}

type Summary = PlatformSummary | OrgSummary;

export function DashboardShell() {
  const { user, accessToken } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .get<Summary>("/dashboard/summary", accessToken)
      .then(setSummary)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Could not load dashboard");
      });
  }, [accessToken]);

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-mist-50">
      <Sidebar />
      <main className="flex-1 px-10 py-8">
        <header className="mb-8">
          <h1 className="font-display text-2xl text-ink-950">
            Welcome, {user.fullName.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-mist-600">
            {user.role === "SUPER_ADMIN"
              ? "Platform overview"
              : `${user.organization?.name} — ${user.role.replace("_", " ")} dashboard`}
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!summary && !error && (
          <p className="text-sm text-mist-600">Loading dashboard…</p>
        )}

        {summary && summary.scope === "PLATFORM" && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Organizations" value={summary.organizationCount} />
            <StatCard label="Total users" value={summary.userCount} />
          </div>
        )}

        {summary && summary.scope === "ORGANIZATION" && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Users in organization" value={summary.userCount} />
              <StatCard label="Students" value={summary.totalStudents} />
              <StatCard label="Teachers" value={summary.totalTeachers} />
              <StatCard
                label="Today's attendance"
                value={summary.todaysAttendance ?? "—"}
              />
            </div>

            <div className="mt-8">
              <h2 className="font-display text-lg text-ink-950">Users by role</h2>
              <div className="mt-3 divide-y divide-mist-200 rounded-lg border border-mist-200 bg-white">
                {summary.roleBreakdown.length === 0 && (
                  <p className="px-4 py-3 text-sm text-mist-600">No users yet.</p>
                )}
                {summary.roleBreakdown.map((r) => (
                  <div
                    key={r.role}
                    className="flex items-center justify-between px-4 py-3 text-sm"
                  >
                    <span className="text-ink-800">{r.role.replace("_", " ")}</span>
                    <span className="font-medium text-ink-950">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="mt-10 rounded-lg border border-dashed border-mist-200 bg-white px-5 py-4 text-sm text-mist-600">
          This is the Phase 1 dashboard shell. Academic structure, students,
          courses, attendance sessions, and biometric enrollment land in
          Phases 2–5 per the roadmap.
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-mist-200 bg-white px-5 py-4">
      <p className="text-xs text-mist-400">{label}</p>
      <p className="mt-1 font-display text-2xl text-ink-950">{value}</p>
    </div>
  );
}
