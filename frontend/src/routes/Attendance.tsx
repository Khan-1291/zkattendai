import { useEffect, useState, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { ApiError, api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

type Offering = { id: string; course: { code: string; title: string }; section: { name: string }; semester: { name: string } };
type Session = { id: string; sessionDate: string; title?: string | null; status: string; courseOffering: Offering; _count: { records: number } };
type Eligible = { student: { id: string; studentNumber: string; user: { fullName: string } }; attendanceRecords: { status: string }[] };
type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export function AttendancePage() {
  const { user } = useAuth();
  if (user?.role === "TEACHER") return <TeacherAttendance />;
  return <SessionHistory />;
}

export function StudentAttendancePage() {
  const { accessToken } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [percentages, setPercentages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      api.get<{ records: any[] }>("/attendance/students/me", accessToken),
      api.get<{ student: { id: string } }>("/students/me", accessToken),
    ]).then(async ([history, profile]) => {
      setRecords(history.records);
      const offeringIds = [...new Set(history.records.map((record) => record.attendanceSession.courseOfferingId))];
      const results = await Promise.all(offeringIds.map((id) => api.get<{ percentages: any[] }>(`/attendance/offerings/${id}/percentage`, accessToken)));
      setPercentages(results.flatMap((result) => result.percentages));
      void profile;
    }).catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load attendance history")).finally(() => setLoading(false));
  }, [accessToken]);

  return <AttendanceLayout title="My attendance"><Notice error={error} />{loading ? <Loading /> : records.length === 0 ? <Empty text="No attendance records yet." /> : <div className="space-y-4"><section className="rounded-lg border border-mist-200 bg-white"><div className="border-b border-mist-200 px-5 py-4"><h2 className="font-display text-lg text-ink-950">Course percentages</h2></div>{percentages.map((item) => <div key={item.studentId} className="flex justify-between border-b border-mist-100 px-5 py-4 text-sm"><span>Attendance percentage</span><strong>{item.percentage}%</strong></div>)}</section><section className="rounded-lg border border-mist-200 bg-white"><div className="border-b border-mist-200 px-5 py-4"><h2 className="font-display text-lg text-ink-950">History</h2></div>{records.map((record) => <div key={record.id} className="flex justify-between border-b border-mist-100 px-5 py-4 text-sm"><span>{new Date(record.attendanceSession.sessionDate).toLocaleDateString()}</span><span className="font-medium">{record.status}</span></div>)}</section></div>}</AttendanceLayout>;
}

function TeacherAttendance() {
  const { accessToken } = useAuth();
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedOffering, setSelectedOffering] = useState("");
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [students, setStudents] = useState<Eligible[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!accessToken) return;
    try {
      const [offeringResult, sessionResult] = await Promise.all([api.get<{ offerings: Offering[] }>("/course-offerings/mine", accessToken), api.get<{ sessions: Session[] }>("/attendance/sessions", accessToken)]);
      setOfferings(offeringResult.offerings); setSessions(sessionResult.sessions);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not load attendance"); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [accessToken]);

  async function startSession() {
    if (!accessToken || !selectedOffering) return;
    setError(null); setMessage(null);
    try {
      const result = await api.post<{ session: Session }>("/attendance/sessions", { courseOfferingId: selectedOffering, sessionDate: new Date().toISOString() }, accessToken);
      await openSession(result.session);
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not start session"); }
  }
  async function openSession(session: Session) {
    if (!accessToken) return;
    try {
      const result = await api.get<{ students: Eligible[] }>(`/attendance/sessions/${session.id}/eligible-students`, accessToken);
      setActiveSession(session); setStudents(result.students);
      setStatuses(Object.fromEntries(result.students.map((item) => [item.student.id, (item.attendanceRecords[0]?.status ?? "ABSENT") as AttendanceStatus])));
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not load eligible students"); }
  }
  async function saveAttendance() {
    if (!accessToken || !activeSession) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      await api.post(`/attendance/sessions/${activeSession.id}/records/bulk`, { records: Object.entries(statuses).map(([studentId, status]) => ({ studentId, status })) }, accessToken);
      setMessage("Attendance saved."); await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not save attendance"); } finally { setSaving(false); }
  }
  async function closeSession() {
    if (!accessToken || !activeSession || !window.confirm("Close this attendance session? Further teacher edits will be blocked.")) return;
    try { await api.post(`/attendance/sessions/${activeSession.id}/close`, {}, accessToken); setMessage("Session closed."); setActiveSession(null); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Could not close session"); }
  }

  return <AttendanceLayout title="Attendance"><Notice error={error} message={message} />{loading ? <Loading /> : <><section className="mb-8 rounded-lg border border-mist-200 bg-white p-5"><h2 className="font-display text-lg text-ink-950">Start attendance</h2><div className="mt-4 flex flex-wrap gap-3"><select value={selectedOffering} onChange={(event) => setSelectedOffering(event.target.value)} className="rounded-md border border-mist-200 px-3 py-2.5"><option value="">Select course offering</option>{offerings.map((offering) => <option key={offering.id} value={offering.id}>{offering.course.code} · {offering.section.name} · {offering.semester.name}</option>)}</select><button onClick={() => void startSession()} disabled={!selectedOffering} className="rounded-md bg-ink-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">Start session</button></div></section>{activeSession && <section className="mb-8 rounded-lg border border-mist-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-mist-200 px-5 py-4"><h2 className="font-display text-lg text-ink-950">{activeSession.courseOffering.course.code} attendance</h2><div className="flex gap-3"><Link to="/app/biometrics/verify" className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Open Biometric Scanner</Link><button onClick={() => void saveAttendance()} disabled={saving} className="rounded-md bg-ink-950 px-4 py-2 text-sm text-white">{saving ? "Saving..." : "Save attendance"}</button><button onClick={() => void closeSession()} className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-700">Close session</button></div></div>{students.map((item) => <div key={item.student.id} className="flex items-center justify-between border-b border-mist-100 px-5 py-4 text-sm"><span>{item.student.user.fullName} · {item.student.studentNumber}</span><select value={statuses[item.student.id]} onChange={(event) => setStatuses({ ...statuses, [item.student.id]: event.target.value as AttendanceStatus })} className="rounded-md border border-mist-200 px-3 py-2"><option value="PRESENT">Present</option><option value="LATE">Late</option><option value="ABSENT">Absent</option><option value="EXCUSED">Excused</option></select></div>)}</section>}<section className="rounded-lg border border-mist-200 bg-white"><div className="border-b border-mist-200 px-5 py-4"><h2 className="font-display text-lg text-ink-950">Recent sessions</h2></div>{sessions.length === 0 ? <Empty text="No attendance sessions yet." /> : sessions.map((session) => <button key={session.id} onClick={() => void openSession(session)} className="flex w-full justify-between border-b border-mist-100 px-5 py-4 text-left text-sm hover:bg-mist-50"><span>{session.courseOffering.course.code} · {new Date(session.sessionDate).toLocaleString()}</span><span>{session.status} · {session._count.records} records</span></button>)}</section></>}</AttendanceLayout>;
}

function SessionHistory() {
  const { accessToken } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!accessToken) return; const query = new URLSearchParams(); if (status) query.set("status", status); if (from) query.set("from", from); if (to) query.set("to", to); api.get<{ sessions: Session[] }>(`/attendance/sessions${query.toString() ? `?${query}` : ""}`, accessToken).then((result) => setSessions(result.sessions)).catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load attendance sessions")).finally(() => setLoading(false)); }, [accessToken, status, from, to]);
  return <AttendanceLayout title="Attendance history"><Notice error={error} /><section className="mb-5 flex flex-wrap gap-3 rounded-lg border border-mist-200 bg-white p-4"><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-md border border-mist-200 px-3 py-2 text-sm"><option value="">All statuses</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option><option value="CANCELLED">Cancelled</option></select><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-md border border-mist-200 px-3 py-2 text-sm" /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-md border border-mist-200 px-3 py-2 text-sm" /></section>{loading ? <Loading /> : sessions.length === 0 ? <Empty text="No attendance sessions match these filters." /> : <div className="rounded-lg border border-mist-200 bg-white">{sessions.map((session) => <div key={session.id} className="flex justify-between border-b border-mist-100 px-5 py-4 text-sm"><span>{session.courseOffering.course.code} · {session.courseOffering.section.name}</span><span>{new Date(session.sessionDate).toLocaleDateString()} · {session.status}</span></div>)}</div>}</AttendanceLayout>;
}

function AttendanceLayout({ title, children }: { title: string; children: ReactNode }) { return <div className="flex min-h-screen bg-mist-50"><Sidebar /><main className="flex-1 px-10 py-8"><header className="mb-8"><h1 className="font-display text-2xl text-ink-950">{title}</h1><p className="mt-1 text-sm text-mist-600">Manual attendance management and history.</p></header>{children}</main></div>; }
function Loading() { return <p className="text-sm text-mist-600">Loading...</p>; }
function Empty({ text }: { text: string }) { return <p className="px-5 py-6 text-sm text-mist-600">{text}</p>; }
function Notice({ error, message }: { error?: string | null; message?: string | null }) { return <>{error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}{message && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>}</>; }
