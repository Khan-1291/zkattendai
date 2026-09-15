import { FormEvent, useEffect, useMemo, useState } from "react";
import { Sidebar } from "../components/Sidebar";
import { ApiError, api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

type FieldKind = "text" | "date" | "select";
type Field = { key: string; label: string; kind: FieldKind; required?: boolean; options?: { value: string; label: string }[] };
type RecordValue = string | boolean;
type AcademicRecord = Record<string, RecordValue> & { id: string; isActive: boolean };

type ResourceConfig = {
  title: string;
  singular: string;
  endpoint: string;
  responseKey: string;
  fields: Field[];
};

const configs: Record<string, ResourceConfig> = {
  departments: {
    title: "Departments",
    singular: "department",
    endpoint: "/academic/departments",
    responseKey: "departments",
    fields: [
      { key: "name", label: "Name", kind: "text", required: true },
      { key: "code", label: "Code", kind: "text", required: true },
    ],
  },
  programs: {
    title: "Programs",
    singular: "program",
    endpoint: "/academic/programs",
    responseKey: "programs",
    fields: [
      { key: "name", label: "Name", kind: "text", required: true },
      { key: "code", label: "Code", kind: "text", required: true },
      { key: "departmentId", label: "Department", kind: "select", required: true },
    ],
  },
  terms: {
    title: "Academic terms",
    singular: "academic term",
    endpoint: "/academic/terms",
    responseKey: "academicTerms",
    fields: [
      { key: "name", label: "Name", kind: "text", required: true },
      { key: "code", label: "Code", kind: "text", required: true },
      { key: "startDate", label: "Start date", kind: "date", required: true },
      { key: "endDate", label: "End date", kind: "date", required: true },
    ],
  },
  semesters: {
    title: "Semesters",
    singular: "semester",
    endpoint: "/academic/semesters",
    responseKey: "semesters",
    fields: [
      { key: "name", label: "Name", kind: "text", required: true },
      { key: "code", label: "Code", kind: "text", required: true },
      { key: "academicTermId", label: "Academic term", kind: "select", required: true },
      { key: "startDate", label: "Start date", kind: "date", required: true },
      { key: "endDate", label: "End date", kind: "date", required: true },
    ],
  },
  sections: {
    title: "Sections",
    singular: "section",
    endpoint: "/academic/sections",
    responseKey: "sections",
    fields: [
      { key: "name", label: "Name", kind: "text", required: true },
      { key: "code", label: "Code", kind: "text", required: true },
      { key: "programId", label: "Program", kind: "select", required: true },
      { key: "semesterId", label: "Semester", kind: "select", required: true },
    ],
  },
};

const emptyForm = (config: ResourceConfig) => Object.fromEntries(config.fields.map((field) => [field.key, ""]));

export function DepartmentsPage() { return <AcademicPage config={configs.departments} />; }
export function ProgramsPage() { return <AcademicPage config={configs.programs} />; }
export function TermsPage() { return <AcademicPage config={configs.terms} />; }
export function SemestersPage() { return <AcademicPage config={configs.semesters} />; }
export function SectionsPage() { return <AcademicPage config={configs.sections} />; }

function AcademicPage({ config }: { config: ResourceConfig }) {
  const { accessToken } = useAuth();
  const [records, setRecords] = useState<AcademicRecord[]>([]);
  const [dependencies, setDependencies] = useState<Record<string, AcademicRecord[]>>({});
  const [form, setForm] = useState<Record<string, RecordValue>>(emptyForm(config));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const dependencyEndpoints = useMemo(() => {
    const endpoints: Record<string, string> = {};
    if (config.endpoint.includes("programs")) endpoints.departments = "/academic/departments";
    if (config.endpoint.includes("sections")) endpoints.terms = "/academic/terms";
    if (config.endpoint.includes("sections")) endpoints.programs = "/academic/programs";
    if (config.endpoint.includes("sections")) endpoints.semesters = "/academic/semesters";
    return endpoints;
  }, [config.endpoint]);

  async function load() {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<Record<string, AcademicRecord[]>>(config.endpoint, accessToken);
      setRecords(result[config.responseKey] ?? []);
      const loaded = await Promise.all(Object.entries(dependencyEndpoints).map(async ([key, endpoint]) => {
        const dependencyResult = await api.get<Record<string, AcademicRecord[]>>(endpoint, accessToken);
        return [key, dependencyResult[Object.keys(dependencyResult)[0]] ?? []] as const;
      }));
      setDependencies(Object.fromEntries(loaded));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not load ${config.title.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [accessToken, config.endpoint]);

  function beginEdit(record: AcademicRecord) {
    setEditingId(record.id);
    setForm(Object.fromEntries(config.fields.map((field) => [field.key, formatFieldValue(field, record[field.key])] )));
    setSuccess(null);
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm(config));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const path = editingId ? `${config.endpoint}/${editingId}` : config.endpoint;
      if (editingId) await api.patch(path, form, accessToken);
      else await api.post(path, form, accessToken);
      await load();
      resetForm();
      setSuccess(`${config.singular[0].toUpperCase()}${config.singular.slice(1)} ${editingId ? "updated" : "created"}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not save ${config.singular}`);
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    if (!accessToken || !window.confirm(`Deactivate this ${config.singular}?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`${config.endpoint}/${id}`, accessToken);
      await load();
      setSuccess(`${config.singular[0].toUpperCase()}${config.singular.slice(1)} deactivated.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not deactivate ${config.singular}`);
    }
  }

  return (
    <div className="flex min-h-screen bg-mist-50">
      <Sidebar />
      <main className="flex-1 px-10 py-8">
        <header className="mb-8">
          <h1 className="font-display text-2xl text-ink-950">{config.title}</h1>
          <p className="mt-1 text-sm text-mist-600">Manage your organization&apos;s academic structure.</p>
        </header>

        {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

        <section className="mb-8 rounded-lg border border-mist-200 bg-white p-5">
          <h2 className="font-display text-lg text-ink-950">{editingId ? `Edit ${config.singular}` : `Add ${config.singular}`}</h2>
          <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
            {config.fields.map((field) => (
              <label key={field.key} className="flex flex-col gap-1.5 text-sm">
                <span className="text-ink-800">{field.label}</span>
                {field.kind === "select" ? (
                  <select required={field.required} value={String(form[field.key] ?? "")} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} className="rounded-md border border-mist-200 bg-white px-3 py-2.5 text-ink-950 outline-none focus:border-ink-700 focus:ring-1 focus:ring-ink-700">
                    <option value="">Select {field.label.toLowerCase()}</option>
                    {optionsFor(field.key, dependencies).map((option) => <option key={option.id} value={option.id}>{option.name} ({option.code})</option>)}
                  </select>
                ) : (
                  <input required={field.required} type={field.kind} value={String(form[field.key] ?? "")} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} className="rounded-md border border-mist-200 bg-white px-3 py-2.5 text-ink-950 outline-none focus:border-ink-700 focus:ring-1 focus:ring-ink-700" />
                )}
              </label>
            ))}
            <div className="flex items-end gap-3 sm:col-span-2">
              <button type="submit" disabled={saving} className="rounded-md bg-ink-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving..." : editingId ? "Update" : "Create"}</button>
              {editingId && <button type="button" onClick={resetForm} className="rounded-md border border-mist-300 px-4 py-2.5 text-sm text-ink-800">Cancel</button>}
            </div>
          </form>
        </section>

        <section className="rounded-lg border border-mist-200 bg-white">
          <div className="border-b border-mist-200 px-5 py-4"><h2 className="font-display text-lg text-ink-950">Existing {config.title.toLowerCase()}</h2></div>
          {loading ? <p className="px-5 py-6 text-sm text-mist-600">Loading...</p> : records.length === 0 ? <p className="px-5 py-6 text-sm text-mist-600">No {config.title.toLowerCase()} yet.</p> : (
            <div className="divide-y divide-mist-200">
              {records.map((record) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="font-medium text-ink-950">{String(record.name)}</p><p className="text-sm text-mist-600">{String(record.code)}{record.isActive ? "" : " · Inactive"}</p></div><div className="flex gap-3"><button onClick={() => beginEdit(record)} className="text-sm font-medium text-ink-800 underline">Edit</button><button onClick={() => void deactivate(record.id)} disabled={!record.isActive} className="text-sm font-medium text-red-700 underline disabled:text-mist-400">Deactivate</button></div></div>)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function formatFieldValue(field: Field, value: RecordValue | undefined) {
  if (field.kind === "date" && typeof value === "string") return value.slice(0, 10);
  return value ?? "";
}

function optionsFor(key: string, dependencies: Record<string, AcademicRecord[]>) {
  if (key === "departmentId") return dependencies.departments ?? [];
  if (key === "academicTermId") return dependencies.terms ?? [];
  if (key === "programId") return dependencies.programs ?? [];
  if (key === "semesterId") return dependencies.semesters ?? [];
  return [];
}
