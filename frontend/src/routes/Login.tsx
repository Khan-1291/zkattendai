import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { ApiError } from "../lib/api";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist-50 px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="font-display text-xl text-ink-950">
          AttendAI
        </Link>
        <h1 className="mt-6 font-display text-2xl text-ink-950">Sign in</h1>
        <p className="mt-1 text-sm text-mist-600">
          Access your organization's attendance dashboard.
        </p>

        <div className="mt-6 rounded-lg border border-mist-200 bg-white p-3.5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-mist-500">
            One-Click Demo Credentials
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEmail("admin@apex.edu");
                setPassword("Admin@12345");
              }}
              className="rounded border border-mist-200 bg-mist-50 px-2.5 py-1 text-xs font-medium text-ink-900 transition-colors hover:bg-mist-100"
            >
              Org Admin
            </button>
            <button
              type="button"
              onClick={() => {
                setEmail("teacher@apex.edu");
                setPassword("Admin@12345");
              }}
              className="rounded border border-mist-200 bg-mist-50 px-2.5 py-1 text-xs font-medium text-ink-900 transition-colors hover:bg-mist-100"
            >
              Faculty
            </button>
            <button
              type="button"
              onClick={() => {
                setEmail("student@apex.edu");
                setPassword("Admin@12345");
              }}
              className="rounded border border-mist-200 bg-mist-50 px-2.5 py-1 text-xs font-medium text-ink-900 transition-colors hover:bg-mist-100"
            >
              Student
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <Field label="Email" type="email" value={email} onChange={setEmail} required />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            required
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-md bg-ink-950 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-sm text-mist-600">
          New organization?{" "}
          <Link to="/signup" className="font-medium text-ink-950 underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

export function Field({
  label,
  type,
  value,
  onChange,
  required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-ink-800">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-mist-200 bg-white px-3 py-2.5 text-ink-950 outline-none focus:border-ink-700 focus:ring-1 focus:ring-ink-700"
      />
    </label>
  );
}
