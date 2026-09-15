import { NavLink } from "react-router-dom";
import { useAuth, Role } from "../lib/auth-context";

const NAV_BY_ROLE: Record<Role, { label: string; path: string }[]> = {
  SUPER_ADMIN: [{ label: "Overview", path: "/app" }, { label: "Organizations", path: "/app" }],
  ORG_ADMIN: [
    { label: "Overview", path: "/app" },
    { label: "Departments", path: "/app/departments" },
    { label: "Programs", path: "/app/programs" },
    { label: "Academic terms", path: "/app/terms" },
    { label: "Semesters", path: "/app/semesters" },
    { label: "Sections", path: "/app/sections" },
    { label: "Students", path: "/app/students" },
    { label: "Teachers", path: "/app/teachers" },
    { label: "Courses", path: "/app/courses" },
    { label: "Offerings", path: "/app/offerings" },
    { label: "Enrollments", path: "/app/enrollments" },
    { label: "Attendance", path: "/app/attendance" },
    { label: "Attendance history", path: "/app/attendance-history" },
    { label: "Biometric Scanner", path: "/app/biometrics/verify" },
    { label: "Biometric Settings", path: "/app/biometrics/settings" },
    { label: "Biometric Audits", path: "/app/biometrics/attempts" },
  ],
  HOD: [
    { label: "Overview", path: "/app" },
    { label: "Departments", path: "/app/departments" },
    { label: "Programs", path: "/app/programs" },
    { label: "Academic terms", path: "/app/terms" },
    { label: "Semesters", path: "/app/semesters" },
    { label: "Sections", path: "/app/sections" },
    { label: "Students", path: "/app/students" },
    { label: "Teachers", path: "/app/teachers" },
    { label: "Courses", path: "/app/courses" },
    { label: "Offerings", path: "/app/offerings" },
    { label: "Enrollments", path: "/app/enrollments" },
    { label: "Biometric Scanner", path: "/app/biometrics/verify" },
    { label: "Biometric Settings", path: "/app/biometrics/settings" },
    { label: "Biometric Audits", path: "/app/biometrics/attempts" },
  ],
  TEACHER: [
    { label: "Overview", path: "/app" },
    { label: "My offerings", path: "/app/my-offerings" },
    { label: "Attendance", path: "/app/attendance" },
    { label: "Attendance history", path: "/app/attendance-history" },
    { label: "Biometric Scanner", path: "/app/biometrics/verify" },
    { label: "Biometric Audits", path: "/app/biometrics/attempts" },
  ],
  STUDENT: [
    { label: "Overview", path: "/app" },
    { label: "My enrollments", path: "/app/my-enrollments" },
    { label: "My attendance", path: "/app/my-attendance" },
    { label: "Biometric Profile", path: "/app/biometrics/enroll" },
    { label: "Biometric Scan", path: "/app/biometrics/verify" },
  ],
};

export function Sidebar() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const items = NAV_BY_ROLE[user.role];

  return (
    <aside className="flex h-screen w-64 flex-col justify-between bg-ink-950 text-mist-100">
      <div>
        <div className="px-6 py-6">
          <p className="font-display text-xl tracking-tight text-white">AttendAI</p>
          <p className="mt-1 text-sm text-mist-400">
            {user.organization?.name ?? "Platform"}
          </p>
        </div>
        <nav className="mt-2 flex flex-col gap-1 px-3">
          {items.map((item) => (
            <NavLink
              key={item.label}
              to={item.path}
              end={item.path === "/app"}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-ink-800 text-white"
                    : "text-mist-200 hover:bg-ink-800 hover:text-white"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="border-t border-ink-800 px-6 py-5">
        <p className="text-sm font-medium text-white">{user.fullName}</p>
        <p className="text-xs text-mist-400">{user.role.replace("_", " ")}</p>
        <button
          onClick={logout}
          className="mt-3 text-sm text-signal-500 hover:text-signal-600"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
