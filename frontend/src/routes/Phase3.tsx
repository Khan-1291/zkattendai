import { FormEvent, useEffect, useMemo, useState } from "react";
import { Sidebar } from "../components/Sidebar";
import { ApiError, api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

type Value = string | number;
type RecordValue = Record<string, any>;
type Field = { key: string; label: string; type: "text" | "email" | "password" | "number" | "select"; required?: boolean; dependency?: string };
type Config = { title: string; singular: string; endpoint: string; responseKey: string; fields: Field[]; dependencies?: Record<string, { endpoint: string; responseKey: string }>; readOnly?: boolean; deactivate?: boolean };

const department = { endpoint: "/academic/departments", responseKey: "departments" };
const program = { endpoint: "/academic/programs", responseKey: "programs" };
const term = { endpoint: "/academic/terms", responseKey: "academicTerms" };
const semester = { endpoint: "/academic/semesters", responseKey: "semesters" };

const configs: Record<string, Config> = {
  students: { title: "Students", singular: "student", endpoint: "/students", responseKey: "students", fields: [{ key: "fullName", label: "Full name", type: "text", required: true }, { key: "email", label: "Email", type: "email", required: true }, { key: "password", label: "Initial password", type: "password", required: true }, { key: "studentNumber", label: "Student ID", type: "text", required: true }, { key: "departmentId", label: "Department", type: "select", required: true, dependency: "departments" }, { key: "programId", label: "Program", type: "select", required: true, dependency: "programs" }, { key: "currentSectionId", label: "Current section", type: "select", dependency: "sections" }], dependencies: { departments: department, programs: program, sections: { endpoint: "/academic/sections", responseKey: "sections" } } },
  teachers: { title: "Teachers", singular: "teacher", endpoint: "/teachers", responseKey: "teachers", fields: [{ key: "fullName", label: "Full name", type: "text", required: true }, { key: "email", label: "Email", type: "email", required: true }, { key: "password", label: "Initial password", type: "password", required: true }, { key: "employeeNumber", label: "Employee ID", type: "text", required: true }, { key: "departmentId", label: "Department", type: "select", required: true, dependency: "departments" }], dependencies: { departments: department } },
  courses: { title: "Courses", singular: "course", endpoint: "/courses", responseKey: "courses", fields: [{ key: "code", label: "Course code", type: "text", required: true }, { key: "title", label: "Course title", type: "text", required: true }, { key: "description", label: "Description", type: "text" }, { key: "creditHours", label: "Credit hours", type: "number", required: true }, { key: "departmentId", label: "Department", type: "select", required: true, dependency: "departments" }], dependencies: { departments: department } },
  offerings: { title: "Course offerings", singular: "course offering", endpoint: "/course-offerings", responseKey: "offerings", fields: [{ key: "courseId", label: "Course", type: "select", required: true, dependency: "courses" }, { key: "academicTermId", label: "Academic term", type: "select", required: true, dependency: "terms" }, { key: "programId", label: "Program", type: "select", required: true, dependency: "programs" }, { key: "semesterId", label: "Semester", type: "select", required: true, dependency: "semesters" }, { key: "sectionId", label: "Section", type: "select", required: true, dependency: "sections" }, { key: "teacherId", label: "Teacher", type: "select", required: true, dependency: "teachers" }], dependencies: { courses: { endpoint: "/courses", responseKey: "courses" }, terms: term, programs: program, semesters: semester, sections: { endpoint: "/academic/sections", responseKey: "sections" }, teachers: { endpoint: "/teachers", responseKey: "teachers" } } },
  enrollments: { title: "Enrollments", singular: "enrollment", endpoint: "/enrollments", responseKey: "enrollments", fields: [{ key: "studentId", label: "Student", type: "select", required: true, dependency: "students" }, { key: "courseOfferingId", label: "Course offering", type: "select", required: true, dependency: "offerings" }], dependencies: { students: { endpoint: "/students", responseKey: "students" }, offerings: { endpoint: "/course-offerings", responseKey: "offerings" } }, deactivate: true },
};

export function StudentsPage() { return <CrudPage config={configs.students} />; }
export function TeachersPage() { return <CrudPage config={configs.teachers} />; }
export function CoursesPage() { return <CrudPage config={configs.courses} />; }
export function OfferingsPage() { return <CrudPage config={configs.offerings} />; }
export function EnrollmentsPage() { return <CrudPage config={configs.enrollments} />; }
export function MyTeacherOfferingsPage() { return <CrudPage config={{ ...configs.offerings, title: "My course offerings", endpoint: "/course-offerings/mine", readOnly: true, dependencies: undefined }} />; }
export function MyStudentEnrollmentsPage() { return <CrudPage config={{ ...configs.enrollments, title: "My enrollments", endpoint: "/enrollments/me", readOnly: true, dependencies: undefined }} />; }

function CrudPage({ config }: { config: Config }) {
  const { accessToken } = useAuth();
  const [records, setRecords] = useState<RecordValue[]>([]);
  const [options, setOptions] = useState<Record<string, RecordValue[]>>({});
  const [form, setForm] = useState<Record<string, Value>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dependencyEntries = useMemo(() => Object.entries(config.dependencies ?? {}), [config.dependencies]);

  async function load() {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const listPath = search && !config.readOnly ? `${config.endpoint}?search=${encodeURIComponent(search)}` : config.endpoint;
      const result = await api.get<Record<string, RecordValue[]>>(listPath, accessToken);
      setRecords(result[config.responseKey] ?? []);
      const loaded = await Promise.all(dependencyEntries.map(async ([key, dependency]) => [key, (await api.get<Record<string, RecordValue[]>>(dependency.endpoint, accessToken))[dependency.responseKey] ?? []] as const));
      setOptions(Object.fromEntries(loaded));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not load ${config.title.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [accessToken, config.endpoint, search]);

  function reset() { setForm({}); setEditingId(null); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const path = editingId ? `${config.endpoint}/${editingId}` : config.endpoint;
      if (editingId) await api.patch(path, form, accessToken); else await api.post(path, form, accessToken);
      reset(); await load(); setMessage(`${config.singular[0].toUpperCase()}${config.singular.slice(1)} ${editingId ? "updated" : "created"}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not save ${config.singular}`);
    } finally { setSaving(false); }
  }

  async function deactivate(recordId: string) {
    if (!accessToken || !window.confirm(`Deactivate this ${config.singular}?`)) return;
    setError(null); setMessage(null);
    try { await api.delete(`${config.endpoint}/${recordId}`, accessToken); await load(); setMessage(`${config.singular[0].toUpperCase()}${config.singular.slice(1)} deactivated.`); }
    catch (err) { setError(err instanceof ApiError ? err.message : `Could not deactivate ${config.singular}`); }
  }

  return <div className="flex min-h-screen bg-mist-50"><Sidebar /><main className="flex-1 px-10 py-8">
    <header className="mb-8"><h1 className="font-display text-2xl text-ink-950">{config.title}</h1><p className="mt-1 text-sm text-mist-600">People, courses, and enrollment for your organization.</p></header>
    {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    {message && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>}
    {!config.readOnly && <section className="mb-8 rounded-lg border border-mist-200 bg-white p-5"><h2 className="font-display text-lg text-ink-950">{editingId ? `Edit ${config.singular}` : `Add ${config.singular}`}</h2><form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">{config.fields.map((field) => <FieldInput key={field.key} field={field} value={form[field.key] ?? ""} options={field.dependency ? options[field.dependency] ?? [] : []} onChange={(value) => setForm({ ...form, [field.key]: value })} />)}<div className="flex gap-3 sm:col-span-2"><button disabled={saving} className="rounded-md bg-ink-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving..." : editingId ? "Update" : "Create"}</button>{editingId && <button type="button" onClick={reset} className="rounded-md border border-mist-300 px-4 py-2.5 text-sm">Cancel</button>}</div></form></section>}
    <section className="rounded-lg border border-mist-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-mist-200 px-5 py-4"><h2 className="font-display text-lg text-ink-950">Existing {config.title.toLowerCase()}</h2>{!config.readOnly && <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" className="rounded-md border border-mist-200 px-3 py-2 text-sm" />}</div>{loading ? <p className="px-5 py-6 text-sm text-mist-600">Loading...</p> : records.length === 0 ? <p className="px-5 py-6 text-sm text-mist-600">No {config.title.toLowerCase()} yet.</p> : <div className="divide-y divide-mist-200">{records.map((record) => <RecordRow key={record.id} config={config} record={record} onEdit={() => { setEditingId(record.id); setForm(formFromRecord(config, record)); }} onDeactivate={() => void deactivate(record.id)} />)}</div>}</section>
  </main></div>;
}

function FieldInput({ field, value, options, onChange }: { field: Field; value: Value; options: RecordValue[]; onChange: (value: Value) => void }) {
  return <label className="flex flex-col gap-1.5 text-sm"><span className="text-ink-800">{field.label}</span>{field.type === "select" ? <select required={field.required} value={String(value)} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-mist-200 bg-white px-3 py-2.5"><option value="">Select {field.label.toLowerCase()}</option>{options.map((option) => <option key={option.id} value={option.id}>{optionLabel(option)}</option>)}</select> : <input required={field.required} type={field.type} value={String(value)} onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)} className="rounded-md border border-mist-200 bg-white px-3 py-2.5" />}</label>;
}

function RecordRow({ config, record, onEdit, onDeactivate }: { config: Config; record: RecordValue; onEdit: () => void; onDeactivate: () => void }) {
  const active = record.isActive !== false && record.status !== "INACTIVE" && record.status !== "DROPPED";
  return <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="font-medium text-ink-950">{recordLabel(config, record)}</p><p className="text-sm text-mist-600">{recordStatus(record)}</p></div>{!config.readOnly && <div className="flex gap-3"><button onClick={onEdit} className="text-sm font-medium underline">Edit</button>{(config.deactivate ?? true) && <button disabled={!active} onClick={onDeactivate} className="text-sm font-medium text-red-700 underline disabled:text-mist-400">Deactivate</button>}</div>}</div>;
}

function formFromRecord(config: Config, record: RecordValue) { return Object.fromEntries(config.fields.filter((field) => field.type !== "password").map((field) => [field.key, record[field.key] ?? ""])); }
function optionLabel(record: RecordValue) { return record.title ? `${record.code} - ${record.title}` : record.user?.fullName ? `${record.user.fullName} (${record.employeeNumber ?? record.studentNumber ?? ""})` : `${record.name ?? record.code ?? record.id}`; }
function recordLabel(config: Config, record: RecordValue) {
  if (config.endpoint.includes("students")) return `${record.user?.fullName ?? "Student"} · ${record.studentNumber ?? ""}`;
  if (config.endpoint.includes("teachers")) return `${record.user?.fullName ?? "Teacher"} · ${record.employeeNumber ?? ""}`;
  if (config.endpoint.includes("courses")) return `${record.code} · ${record.title}`;
  if (config.endpoint.includes("course-offerings")) return `${record.course?.code ?? "Course"} · ${record.section?.name ?? "Section"}`;
  if (config.endpoint.includes("enrollments")) return `${record.student?.user?.fullName ?? "Student"} · ${record.courseOffering?.course?.code ?? "Course"}`;
  return record.name ?? record.id;
}
function recordStatus(record: RecordValue) { return record.status ?? (record.isActive === false ? "INACTIVE" : "ACTIVE"); }
