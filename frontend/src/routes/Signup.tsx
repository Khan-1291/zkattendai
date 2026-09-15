import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { ApiError } from "../lib/api";
import { Field } from "./Login";

export function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [organizationName, setOrganizationName] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup({ organizationName, adminFullName, adminEmail, adminPassword });
      navigate("/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="font-display text-xl text-ink-950">
          AttendAI
        </Link>
        <h1 className="mt-6 font-display text-2xl text-ink-950">Create your organization</h1>
        <p className="mt-1 text-sm text-mist-600">
          This creates your institute's workspace and your admin account.
        </p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
          <Field
            label="Organization name"
            type="text"
            value={organizationName}
            onChange={setOrganizationName}
            required
          />
          <Field
            label="Your full name"
            type="text"
            value={adminFullName}
            onChange={setAdminFullName}
            required
          />
          <Field label="Email" type="email" value={adminEmail} onChange={setAdminEmail} required />
          <Field
            label="Password"
            type="password"
            value={adminPassword}
            onChange={setAdminPassword}
            required
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-md bg-ink-950 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create organization"}
          </button>
        </form>

        <p className="mt-6 text-sm text-mist-600">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-ink-950 underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
