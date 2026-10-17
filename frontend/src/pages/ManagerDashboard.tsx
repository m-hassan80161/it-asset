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
const ticketStatusColors: Record<TicketStatus, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-violet-100 text-violet-800",
  WAITING_USER: "bg-amber-100 text-amber-900",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-slate-200 text-slate-700",
};
const ticketPriorityColors: Record<TicketPriority, string> = {
  LOW: "bg-slate-100 text-slate-700",
  MEDIUM: "bg-sky-100 text-sky-800",
  HIGH: "bg-orange-100 text-orange-800",
  URGENT: "bg-red-100 text-red-800",
};
const tableColumns = [
  ["id", "Ticket ID"],
  ["title", "العنوان"],
  ["requester", "مقدم الطلب"],
  ["status", "الحالة"],
  ["branch", "الفرع"],
  ["admin", "الأدمن المسؤول"],
  ["timing", "المدة"],
  ["priority", "الأولوية"],
  ["assignment", "الإسناد"],
] as const;
type TicketColumn = typeof tableColumns[number][0];
type TicketSort = { column: TicketColumn; direction: "asc" | "desc" };
const defaultColumnWidths: Record<TicketColumn, number> = {
  id: 150,
  title: 220,
  requester: 180,
  status: 130,
  branch: 140,
  admin: 180,
  timing: 330,
  priority: 120,
  assignment: 200,
};
function durationLabel(milliseconds: number) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1_000);
  if (totalSeconds < 60) return `${totalSeconds} ثانية`;
  const minutes = Math.floor(totalSeconds / 60);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  return `${days ? `${days}ي ` : ""}${hours ? `${hours}س ` : ""}${minutes % 60}د`;
}

function ticketTiming(ticket: Ticket) {
  const estimatedAssignment = !ticket.assignedAt && Boolean(ticket.assignedAdminId);
  const assignedAt = ticket.assignedAt ?? (ticket.assignedAdminId ? ticket.createdAt : null);
  const estimatedClosure = !ticket.closedAt && ticket.status === "CLOSED";
  const closedAt = ticket.closedAt ??
    (ticket.status === "CLOSED" ? ticket.resolvedAt ?? ticket.updatedAt : null);
  const waitingSince = ticket.waitingUserStartedAt ??
    (ticket.status === "WAITING_USER" ? ticket.updatedAt : null);
  const waitingMs = ticket.waitingUserDurationMs +
    (waitingSince ? Math.max(0, Date.now() - new Date(waitingSince).getTime()) : 0);
  return {
    submittedToAssignment: assignedAt
      ? `${estimatedAssignment ? "تقريبًا " : ""}${durationLabel(new Date(assignedAt).getTime() - new Date(ticket.createdAt).getTime())}`
      : "بانتظار الاستلام",
    assignmentToClosure: assignedAt
      ? `${estimatedAssignment || estimatedClosure ? "تقريبًا " : ""}${durationLabel(
          (closedAt ? new Date(closedAt).getTime() : Date.now()) - new Date(assignedAt).getTime(),
        )}${closedAt ? "" : " (مستمر)"}`
      : "غير متاح قبل الاستلام",
    waiting: waitingSince || ticket.waitingUserDurationMs > 0
      ? `${durationLabel(waitingMs)}${ticket.status === "WAITING_USER" ? " (مستمر)" : ""}`
      : "لا يوجد وقت انتظار مسجل",
  };
}

function ticketSortValue(ticket: Ticket, column: TicketColumn): string | number {
  switch (column) {
    case "id": return ticket.id;
    case "title": return ticket.title;
    case "requester": return ticket.requester?.fullName ?? ticket.requesterName;
    case "status": return ticket.status;
    case "branch": return ticket.branch;
    case "admin": return ticket.assignedAdmin?.fullName ?? ticket.assignedAdminName ?? "";
    case "priority": return ticketPriorities.indexOf(ticket.priority);
    case "assignment": return ticket.assignedAdminId ? 1 : 0;
    case "timing": return ticket.assignedAt
      ? new Date(ticket.assignedAt).getTime() - new Date(ticket.createdAt).getTime()
      : Number.MAX_SAFE_INTEGER;
  }
}

function csvCell(value: string | number | null | undefined) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(tickets: Ticket[]) {
  const rows = [
    ["Ticket ID", "Title", "Requester", "Status", "Branch", "Assigned Admin", "Priority"],
    ...tickets.map((ticket) => [
      ticket.id,
      ticket.title,
      `${ticket.requester?.fullName ?? ticket.requesterName} (${ticket.requester?.username ?? ticket.requesterUsername})`,
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
  const [closedOnly, setClosedOnly] = useState(false);
  const [ticketSort, setTicketSort] = useState<TicketSort>({ column: "id", direction: "asc" });

  const load = useCallback(async () => {
    setError("");
    const filters: TicketFilters = {
      ...(branch ? { branch } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(category ? { category } : {}),
      closed: closedOnly,
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
  }, [branch, category, closedOnly, priority, skip, status]);

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
          closed: closedOnly,
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

  const maxStatus = Math.max(1, ...statuses.map((item) => item.value));
  const maxBranch = Math.max(1, ...stats.byBranch.map((item) => item.total));
  const maxResolution = Math.max(
    1,
    ...stats.admins.map((admin) => admin.averageResolutionMinutes ?? 0),
  );
  const adminsForBranch = (ticketBranch: string) =>
    admins.filter((admin) => admin.isActive && (
      user.role === "SUPER_ADMIN" || admin.branch === ticketBranch
    ));
  const branchChoices = [...new Set([
    ...user.managedBranches,
    ...stats.byBranch.map((item) => item.branch),
    ...admins.map((admin) => admin.branch).filter((value): value is string => Boolean(value)),
  ])];
  const orderedTableColumns = tableColumns;
  const sortedTickets = useMemo(() => {
    const collator = new Intl.Collator("ar", { numeric: true, sensitivity: "base" });
    return [...tickets].sort((left, right) => {
      const a = ticketSortValue(left, ticketSort.column);
      const b = ticketSortValue(right, ticketSort.column);
      const result = typeof a === "number" && typeof b === "number"
        ? a - b
        : collator.compare(String(a), String(b));
      return ticketSort.direction === "asc" ? result : -result;
    });
  }, [tickets, ticketSort]);

  if (loading) return <p>جارٍ تحميل لوحة المتابعة...</p>;

  const toggleSort = (column: TicketColumn) => {
    setTicketSort((current) => ({
      column,
      direction: current.column === column && current.direction === "asc" ? "desc" : "asc",
    }));
  };

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
    <section className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">لوحة متابعة المدير</h1>
          <p className="mt-2 text-slate-600">الفروع ضمن نطاق الحساب: {user.managedBranches.join("، ") || "كل الفروع"}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="rounded border px-4 py-2">تحديث</button>
        </div>
      </header>
      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">ملخص الإحصائيات</h2>
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
      </section>

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
          <h2 className="text-xl font-semibold">{closedOnly ? "أرشيف التيكتس المغلقة" : "تيكتس النطاق"} ({total})</h2>
          <button onClick={() => void exportAllFiltered()} disabled={exporting || total === 0} className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50">
            {exporting ? "جارٍ التصدير..." : "تصدير Excel (CSV)"}
          </button>
        </div>
        <div className="flex gap-2" role="tablist" aria-label="تقسيم التيكتس">
          <button
            role="tab"
            aria-selected={!closedOnly}
            onClick={() => { setClosedOnly(false); setStatus(""); setSkip(0); }}
            className={`rounded px-4 py-2 ${!closedOnly ? "bg-blue-700 text-white" : "border bg-white"}`}
          >التيكتس الفعالة</button>
          <button
            role="tab"
            aria-selected={closedOnly}
            onClick={() => { setClosedOnly(true); setStatus(""); setSkip(0); }}
            className={`rounded px-4 py-2 ${closedOnly ? "bg-slate-700 text-white" : "border bg-white"}`}
          >الأرشيف · المغلقة</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select aria-label="الفرع" value={branch} onChange={(event) => { setSkip(0); setBranch(event.target.value); }} className="rounded border px-3 py-2">
            <option value="">كل الفروع</option>
            {stats.byBranch.map((item) => <option key={item.branch}>{item.branch}</option>)}
          </select>
          <select aria-label="الحالة" disabled={closedOnly} value={status} onChange={(event) => { setSkip(0); setStatus(event.target.value as TicketStatus | ""); }} className="rounded border px-3 py-2 disabled:bg-slate-100">
            <option value="">{closedOnly ? "الأرشيف: مغلقة" : "كل الحالات"}</option>
            {ticketStatuses.filter((value) => value !== "CLOSED").map((value) => <option key={value}>{value}</option>)}
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
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>{orderedTableColumns.map(([column]) => <col key={column} style={{ width: defaultColumnWidths[column] }} />)}</colgroup>
            <thead className="bg-slate-100"><tr>
              {orderedTableColumns.map(([column, label]) => (
                <th key={column} className="relative p-3">
                  <button type="button" onClick={() => toggleSort(column)} className="font-semibold hover:text-blue-700">
                    {label}{ticketSort.column === column ? (ticketSort.direction === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr></thead>
            <tbody className="divide-y">
              {sortedTickets.map((ticket) => (
                <tr key={ticket.id}>
                  {orderedTableColumns.map(([column]) => {
                    let cell: React.ReactNode;
                    switch (column) {
                      case "id": cell = <span className="font-mono" title={ticket.id}>{ticket.id}</span>; break;
                      case "title": cell = ticket.title; break;
                      case "requester": cell = <><div>{ticket.requester?.fullName ?? ticket.requesterName}</div>{ticket.requesterPhone && <div dir="ltr" className="text-xs text-slate-500">{ticket.requesterPhone}</div>}</>; break;
                      case "status": cell = <span className={`rounded-full px-2 py-1 text-xs font-medium ${ticketStatusColors[ticket.status]}`}>{ticket.status}</span>; break;
                      case "branch": cell = ticket.branch; break;
                      case "admin": cell = ticket.assignedAdmin?.fullName ?? ticket.assignedAdminName ?? "غير مسند"; break;
                      case "timing": {
                        const timing = ticketTiming(ticket);
                        cell = <div className="space-y-1 text-xs leading-5">
                          <div>من الإرسال للاستلام: <b>{timing.submittedToAssignment}</b></div>
                          <div>من الاستلام للإغلاق: <b>{timing.assignmentToClosure}</b></div>
                          <div>وقت انتظار الموظف: <b>{timing.waiting}</b></div>
                        </div>;
                        break;
                      }
                      case "priority": cell = <span className={`rounded-full px-2 py-1 text-xs font-medium ${ticketPriorityColors[ticket.priority]}`}>{ticket.priority}</span>; break;
                      case "assignment": cell = (!ticket.assignedAdminId || user.role === "SUPER_ADMIN") ? <div className="flex gap-2"><select aria-label={`اختر أدمن للتيكت ${ticket.id}`} value={assignments[ticket.id] ?? ticket.assignedAdminId ?? ""} onChange={(event) => setAssignments((current) => ({ ...current, [ticket.id]: event.target.value }))} className="max-w-40 rounded border px-2 py-1"><option value="">اختر أدمن</option>{adminsForBranch(ticket.branch).map((admin) => <option key={admin.id} value={admin.id}>{admin.fullName}</option>)}</select><button disabled={!assignments[ticket.id] || assignments[ticket.id] === ticket.assignedAdminId} onClick={() => void assign(ticket)} className="rounded border px-2 py-1 disabled:opacity-50">{ticket.assignedAdminId ? "تغيير" : "إسناد"}</button></div> : "—"; break;
                    }
                    return <td key={column} className={`p-3 ${column === "timing" ? "whitespace-normal" : "truncate"}`}>{cell}</td>;
                  })}
                </tr>
              ))}
              {!tickets.length && <tr><td colSpan={Math.max(1, orderedTableColumns.length)} className="p-5 text-center text-slate-500">لا توجد تيكتس مطابقة.</td></tr>}
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
