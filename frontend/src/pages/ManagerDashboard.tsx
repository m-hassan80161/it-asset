import { useCallback, useEffect, useMemo, useState } from "react";
import { AppUser, ManagedAdmin, ManagerDashboardData, Ticket, TicketCategory, TicketPriority, TicketStatus, authApi } from "../lib/api";
import { TicketFilters, ticketsApi } from "../lib/ticketsApi";

interface ManagerDashboardProps {
  user: AppUser;
}

const emptyStats: ManagerDashboardData = {
  total: 0,
  open: 0,
  inProgress: 0,
  waitingUser: 0,
  resolved: 0,
  closed: 0,
  highPriority: 0,
  urgentPriority: 0,
  adminCount: 0,
  averageResolutionMinutes: null,
  byBranch: [],
  admins: [],
};
const ticketStatuses: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"];
const ticketCategories: TicketCategory[] = ["HARDWARE", "SOFTWARE", "NETWORK", "PRINTER", "OTHER"];
const ticketPriorities: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function csvCell(value: string | number | null | undefined) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(tickets: Ticket[]) {
  const rows = [
    ["Ticket ID", "Title", "Status", "Branch", "Assigned Admin", "Priority"],
    ...tickets.map((ticket) => [
      ticket.id,
      ticket.title,
      ticket.status,
      ticket.branch,
      ticket.assignedAdmin?.fullName ?? "",
      ticket.priority,
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "manager-tickets.csv";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ManagerDashboard({ user }: ManagerDashboardProps) {
  const [stats, setStats] = useState(emptyStats);
  const [admins, setAdmins] = useState<ManagedAdmin[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [branch, setBranch] = useState("");
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [priority, setPriority] = useState<TicketPriority | "">("");
  const [category, setCategory] = useState<TicketCategory | "">("");
  const [skip, setSkip] = useState(0);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const filters: TicketFilters = {
      ...(branch ? { branch } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(category ? { category } : {}),
      skip,
      take: 100,
      sortBy: "createdAt",
      sortOrder: "desc",
    };
    try {
      const [overview, ticketList, adminList] = await Promise.all([
        ticketsApi.managerDashboard(),
        ticketsApi.managerList(filters),
        authApi.admins(),
      ]);
      setStats(overview.data);
      setTickets(ticketList.data.data);
      setTotal(ticketList.data.total);
      setAdmins(adminList.data);
    } catch {
      setError("تعذر تحميل بيانات المتابعة أو حسابات الأدمن.");
    } finally {
      setLoading(false);
    }
  }, [branch, category, priority, skip, status]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const exportAllFiltered = async () => {
    setExporting(true);
    setError("");
    try {
      const all: Ticket[] = [];
      for (let pageSkip = 0; pageSkip < total; pageSkip += 100) {
        const response = await ticketsApi.managerList({
          ...(branch ? { branch } : {}),
          ...(status ? { status } : {}),
          ...(priority ? { priority } : {}),
          ...(category ? { category } : {}),
          skip: pageSkip,
          take: 100,
          sortBy: "createdAt",
          sortOrder: "desc",
        });
        all.push(...response.data.data);
      }
      downloadCsv(all);
    } catch {
      setError("تعذر تصدير كل النتائج المطابقة.");
    } finally {
      setExporting(false);
    }
  };

  const statuses = useMemo(() => [
    { label: "مفتوحة", value: stats.open },
    { label: "قيد المعالجة", value: stats.inProgress },
    { label: "بانتظار الموظف", value: stats.waitingUser },
    { label: "تم الحل", value: stats.resolved },
    { label: "مغلقة", value: stats.closed },
  ], [stats]);

  if (loading) return <p>جارٍ تحميل لوحة المتابعة...</p>;

  const maxStatus = Math.max(1, ...statuses.map((item) => item.value));
  const maxBranch = Math.max(1, ...stats.byBranch.map((item) => item.total));
  const maxResolution = Math.max(
    1,
    ...stats.admins.map((admin) => admin.averageResolutionMinutes ?? 0),
  );
  const adminsForBranch = (ticketBranch: string) =>
    admins.filter((admin) => admin.branch === ticketBranch && admin.isActive);
  const branchChoices = [...new Set([
    ...user.managedBranches,
    ...stats.byBranch.map((item) => item.branch),
    ...admins.map((admin) => admin.branch).filter((value): value is string => Boolean(value)),
  ])];

  const assign = async (ticket: Ticket) => {
    const adminId = assignments[ticket.id];
    if (!adminId) return;
    try {
      await ticketsApi.assign(ticket.id, adminId);
      await load();
    } catch {
      setError("تعذر إسناد التيكت إلى هذا الأدمن.");
    }
  };

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">لوحة متابعة المدير</h1>
          <p className="mt-2 text-slate-600">الفروع ضمن نطاق الحساب: {user.managedBranches.join("، ") || "كل الفروع"}</p>
        </div>
        <button onClick={() => void load()} className="rounded border px-4 py-2">تحديث</button>
      </header>
      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["إجمالي التيكتس", stats.total],
          ["عدد الأدمنز", stats.adminCount],
          ["عالية الأولوية", stats.highPriority],
          ["عاجلة", stats.urgentPriority],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white p-5 shadow">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold text-blue-800">{value}</p>
          </div>
        ))}
        <div className="rounded-lg bg-white p-5 shadow sm:col-span-2 lg:col-span-4">
          <p className="text-sm text-slate-500">متوسط وقت الحل</p>
          <p className="mt-2 text-3xl font-bold text-blue-800">
            {stats.averageResolutionMinutes === null ? "لا توجد بيانات" : `${stats.averageResolutionMinutes} دقيقة`}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-lg bg-white p-5 shadow">
          <h2 className="mb-4 text-lg font-semibold">التيكتس حسب الحالة</h2>
          <div className="space-y-3">
            {statuses.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex justify-between text-sm"><span>{item.label}</span><b>{item.value}</b></div>
                <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-blue-700" style={{ width: `${(item.value / maxStatus) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-lg bg-white p-5 shadow">
          <h2 className="mb-4 text-lg font-semibold">التيكتس حسب الفرع</h2>
          <div className="space-y-3">
            {stats.byBranch.map((item) => (
              <div key={item.branch}>
                <div className="mb-1 flex justify-between text-sm"><span>{item.branch}</span><b>{item.total}</b></div>
                <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-indigo-600" style={{ width: `${(item.total / maxBranch) * 100}%` }} /></div>
              </div>
            ))}
            {stats.byBranch.length === 0 && <p className="text-sm text-slate-500">لا توجد بيانات فروع.</p>}
          </div>
        </section>
        <section className="rounded-lg bg-white p-5 shadow">
          <h2 className="mb-4 text-lg font-semibold">متوسط الحل حسب الأدمن (دقيقة)</h2>
          <div className="space-y-3">
            {stats.admins.map((admin) => (
              <div key={admin.id}>
                <div className="mb-1 flex justify-between gap-2 text-sm">
                  <span className="truncate">{admin.fullName}</span>
                  <b>{admin.averageResolutionMinutes === null ? "—" : `${admin.averageResolutionMinutes}m`}</b>
                </div>
                <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-amber-500" style={{ width: `${((admin.averageResolutionMinutes ?? 0) / maxResolution) * 100}%` }} /></div>
                <p className="text-xs text-slate-500">{admin.resolvedTickets} طلب محلول · {admin.branch ?? "—"}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="space-y-4 rounded-lg bg-white p-5 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">كل تيكتس النطاق ({total})</h2>
          <button onClick={() => void exportAllFiltered()} disabled={exporting || total === 0} className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50">
            {exporting ? "جارٍ التصدير..." : "تصدير Excel (CSV)"}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select aria-label="الفرع" value={branch} onChange={(event) => { setSkip(0); setBranch(event.target.value); }} className="rounded border px-3 py-2">
            <option value="">كل الفروع</option>
            {stats.byBranch.map((item) => <option key={item.branch}>{item.branch}</option>)}
          </select>
          <select aria-label="الحالة" value={status} onChange={(event) => { setSkip(0); setStatus(event.target.value as TicketStatus | ""); }} className="rounded border px-3 py-2">
            <option value="">كل الحالات</option>
            {ticketStatuses.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select aria-label="الأولوية" value={priority} onChange={(event) => { setSkip(0); setPriority(event.target.value as TicketPriority | ""); }} className="rounded border px-3 py-2">
            <option value="">كل الأولويات</option>
            {ticketPriorities.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select aria-label="التصنيف" value={category} onChange={(event) => { setSkip(0); setCategory(event.target.value as TicketCategory | ""); }} className="rounded border px-3 py-2">
            <option value="">كل التصنيفات</option>
            {ticketCategories.map((value) => <option key={value}>{value}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100"><tr><th className="p-3">Ticket ID</th><th className="p-3">العنوان</th><th className="p-3">الحالة</th><th className="p-3">الفرع</th><th className="p-3">الأدمن المسؤول</th><th className="p-3">الأولوية</th><th className="p-3">الإسناد</th></tr></thead>
            <tbody className="divide-y">
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td className="max-w-32 truncate p-3 font-mono" title={ticket.id}>{ticket.id}</td>
                  <td className="p-3">{ticket.title}</td>
                  <td className="p-3">{ticket.status}</td>
                  <td className="p-3">{ticket.branch}</td>
                  <td className="p-3">{ticket.assignedAdmin?.fullName ?? ticket.assignedAdminName ?? "غير مسند"}</td>
                  <td className="p-3">{ticket.priority}</td>
                  <td className="p-3">
                    {!ticket.assignedAdminId && (
                      <div className="flex gap-2">
                        <select aria-label={`اختر أدمن للتيكت ${ticket.id}`} value={assignments[ticket.id] ?? ""} onChange={(event) => setAssignments((current) => ({ ...current, [ticket.id]: event.target.value }))} className="max-w-40 rounded border px-2 py-1">
                          <option value="">اختر أدمن</option>
                          {adminsForBranch(ticket.branch).map((admin) => <option key={admin.id} value={admin.id}>{admin.fullName}</option>)}
                        </select>
                        <button disabled={!assignments[ticket.id]} onClick={() => void assign(ticket)} className="rounded border px-2 py-1 disabled:opacity-50">إسناد</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!tickets.length && <tr><td colSpan={7} className="p-5 text-center text-slate-500">لا توجد تيكتس مطابقة.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <button disabled={!skip} onClick={() => setSkip(Math.max(0, skip - 100))} className="rounded border px-3 py-1 disabled:opacity-50">السابق</button>
          <button disabled={skip + tickets.length >= total} onClick={() => setSkip(skip + 100)} className="rounded border px-3 py-1 disabled:opacity-50">التالي</button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">إدارة الأدمنز والأداء</h2>
        {stats.admins.map((admin) => (
          <div key={admin.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4 shadow">
            <div>
              <p className="font-semibold">{admin.fullName}</p>
              <p className="text-sm text-slate-500">{admin.resolvedTickets} طلب محلول · متوسط {admin.averageResolutionMinutes ?? "—"} دقيقة</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              الفرع
              <select
                value={admin.branch ?? ""}
                onChange={async (event) => {
                  try {
                    await authApi.assignAdminBranch(admin.id, event.target.value);
                    await load();
                  } catch {
                    setError("تعذر تحديث فرع الأدمن.");
                  }
                }}
                className="rounded border px-2 py-1"
              >
                {branchChoices.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
          </div>
        ))}
      </section>
    </section>
  );
}
