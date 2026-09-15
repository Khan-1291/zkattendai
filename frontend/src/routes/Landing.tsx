import { Link } from "react-router-dom";

export function Landing() {
  return (
    <div className="min-h-screen bg-ink-950 text-mist-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-display text-lg text-white">AttendAI</span>
        <nav className="flex items-center gap-6 text-sm text-mist-200">
          <Link to="/login" className="hover:text-white">
            Sign in
          </Link>
          <Link
            to="/signup"
            className="rounded-md bg-signal-500 px-4 py-2 font-medium text-ink-950 hover:bg-signal-600"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-24 pt-16 text-center">
        <h1 className="font-display text-4xl leading-tight text-white sm:text-5xl">
          Attendance that knows who's actually in the room.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-mist-300">
          Face and voice verification replace the roll call. Every mark is
          tied to a verified identity, not a signature or a proxy.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/signup"
            className="rounded-md bg-signal-500 px-5 py-3 font-medium text-ink-950 hover:bg-signal-600"
          >
            Create your organization
          </Link>
          <Link
            to="/login"
            className="rounded-md border border-mist-600 px-5 py-3 font-medium text-white hover:bg-ink-800"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="border-t border-ink-800 bg-ink-900">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 py-16 sm:grid-cols-3">
          <Feature
            title="Normal mode"
            body="Face recognition plus liveness — fast attendance for everyday classes."
          />
          <Feature
            title="Secure mode"
            body="Adds voice verification and multimodal fusion where identity matters more."
          />
          <Feature
            title="Real isolation"
            body="Every institute's students, staff, and records are walled off from every other."
          />
        </div>
      </section>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-display text-lg text-white">{title}</h3>
      <p className="mt-2 text-sm text-mist-300">{body}</p>
    </div>
  );
}
