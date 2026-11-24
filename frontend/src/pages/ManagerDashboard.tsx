import { useCallback, useEffect, useMemo, useState } from "react";
import { AppUser, ManagedAdmin, ManagerDashboardData, Ticket, TicketCategory, TicketPriority, TicketStatus, authApi } from "../lib/api";
import { TicketFilters, ticketsApi } from "../lib/ticketsApi";
import { formatTicketCode } from "../lib/ticketFormatting";

interface ManagerDashboardProps {
  user: AppUser;
}

const emptyStats: ManagerDashboardData = {
  total: 0,
  open: 0,
  inProgress: 0,
  waitingUser: 0,
  closed: 0,
  highPriority: 0,
  urgentPriority: 0,
  adminCount: 0,
  averageResolutionMinutes: null,
  byBranch: [],
  recurrentProblems: [],
  monthlyTickets: [],
  admins: [],
};
const ticketStatuses: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_USER"];
const ticketCategories: TicketCategory[] = ["HARDWARE", "SOFTWARE", "NETWORK", "PRINTER", "OTHER"];
const ticketPriorities: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const ticketStatusColors: Record<TicketStatus, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-violet-100 text-violet-800",
  WAITING_USER: "bg-amber-100 text-amber-900",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-slate-200 text-slate-700",
};
const ticketStatusLabels: Record<TicketStatus, string> = {
  OPEN: "مفتوحة",
  IN_PROGRESS: "قيد المعالجة",
  WAITING_USER: "بانتظار الموظف",
  RESOLVED: "مغلقة",
  CLOSED: "مغلقة",
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
  assignment: 280,
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
    case "id": return ticket.ticketNumber;
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
      formatTicketCode(ticket.ticketNumber),
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

function dateTimeLocalValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 19);
}

function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("ar", {
    year: "numeric",
    month: "long",
  });
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
  const [assignedAdminId, setAssignedAdminId] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [skip, setSkip] = useState(0);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [closedOnly, setClosedOnly] = useState(false);
  const [ticketSort, setTicketSort] = useState<TicketSort>({ column: "id", direction: "desc" });

  const load = useCallback(async () => {
    setError("");
    if (rangeFrom && rangeTo && new Date(rangeFrom) > new Date(rangeTo)) {
      setError("تاريخ البداية يجب أن يكون قبل تاريخ النهاية.");
      setLoading(false);
      return;
    }
    const filters: TicketFilters = {
      ...(branch ? { branch } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(category ? { category } : {}),
      ...(assignedAdminId ? { assignedAdminId } : {}),
      ...(rangeFrom ? { from: new Date(rangeFrom).toISOString() } : {}),
      ...(rangeTo ? { to: new Date(rangeTo).toISOString() } : {}),
      closed: closedOnly,
      skip,
      take: 100,
      sortBy: "ticketNumber",
      sortOrder: "desc",
    };
    try {
      const [overview, ticketList, adminList] = await Promise.all([
        ticketsApi.managerDashboard({ ...filters, closed: undefined }),
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
  }, [assignedAdminId, branch, category, closedOnly, priority, rangeFrom, rangeTo, skip, status]);

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
          ...(assignedAdminId ? { assignedAdminId } : {}),
          ...(rangeFrom ? { from: new Date(rangeFrom).toISOString() } : {}),
          ...(rangeTo ? { to: new Date(rangeTo).toISOString() } : {}),
          closed: closedOnly,
          skip: pageSkip,
          take: 100,
          sortBy: "ticketNumber",
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
    { label: "مغلقة", value: stats.closed },
  ], [stats]);

  const maxStatus = Math.max(1, ...statuses.map((item) => item.value));
  const maxBranch = Math.max(1, ...stats.byBranch.map((item) => item.total));
  const maxResolution = Math.max(
    1,
    ...stats.admins.map((admin) => admin.averageResolutionMinutes ?? 0),
  );
  const mostAssignedAdmin = stats.admins.reduce<(typeof stats.admins)[number] | null>(
    (current, admin) => !current || admin.assignedTickets > current.assignedTickets ? admin : current,
    null,
  );
  const mostProblemBranch = stats.byBranch.reduce<(typeof stats.byBranch)[number] | null>(
    (current, item) => !current || item.total > current.total ? item : current,
    null,
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
      <div className="space-y-3 rounded-lg bg-white p-4 shadow">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => {
            const now = new Date();
            setRangeFrom(dateTimeLocalValue(new Date(now.getTime() - 24 * 60 * 60 * 1000)));
            setRangeTo(dateTimeLocalValue(now));
            setSkip(0);
          }} className="rounded border px-3 py-2 hover:bg-slate-50">آخر 24 ساعة</button>
          <button type="button" onClick={() => {
            const now = new Date();
            setRangeFrom(dateTimeLocalValue(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)));
            setRangeTo(dateTimeLocalValue(now));
            setSkip(0);
          }} className="rounded border px-3 py-2 hover:bg-slate-50">آخر 7 أيام</button>
          <button type="button" onClick={() => {
            setRangeFrom("");
            setRangeTo("");
            setSkip(0);
          }} className="rounded border px-3 py-2 hover:bg-slate-50">كل الفترات</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">من تاريخ ووقت
            <input type="datetime-local" step="1" value={rangeFrom} onChange={(event) => {
              setRangeFrom(event.target.value);
              setSkip(0);
            }} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">إلى تاريخ ووقت
            <input type="datetime-local" step="1" value={rangeTo} onChange={(event) => {
              setRangeTo(event.target.value);
              setSkip(0);
            }} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
        </div>
      </div>
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

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-lg bg-white p-5 shadow">
          <h2 className="font-semibold">أكثر مسؤول تعامل مع تيكتات</h2>
          <p className="mt-2 text-xl font-bold text-blue-800">{mostAssignedAdmin?.fullName ?? "لا توجد بيانات"}</p>
          <p className="text-sm text-slate-500">{mostAssignedAdmin?.assignedTickets ?? 0} تيكت مسند</p>
        </article>
        <article className="rounded-lg bg-white p-5 shadow">
          <h2 className="font-semibold">أكثر فرع به مشاكل</h2>
          <p className="mt-2 text-xl font-bold text-blue-800">{mostProblemBranch?.branch ?? "لا توجد بيانات"}</p>
          <p className="text-sm text-slate-500">{mostProblemBranch?.total ?? 0} تيكت</p>
        </article>
        <article className="rounded-lg bg-white p-5 shadow">
          <h2 className="mb-3 font-semibold">المشاكل المتكررة</h2>
          <ul className="space-y-2 text-sm">
            {stats.recurrentProblems.slice(0, 5).map((problem) => (
              <li key={`${problem.category}:${problem.title}`} className="flex justify-between gap-2">
                <span className="truncate">{problem.title} · {problem.category}</span><b>{problem.total}</b>
              </li>
            ))}
            {!stats.recurrentProblems.length && <li className="text-slate-500">لا توجد مشاكل متكررة في الفترة.</li>}
          </ul>
        </article>
      </section>

      <section className="rounded-lg bg-white p-5 shadow">
        <h2 className="mb-4 text-lg font-semibold">عدد التيكتس شهريًا</h2>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {stats.monthlyTickets.map((item) => (
            <div key={item.month} className="flex justify-between rounded bg-slate-50 p-3">
              <span>{formatMonth(item.month)}</span>
              <b>{item.total}</b>
            </div>
          ))}
          {!stats.monthlyTickets.length && <p className="text-sm text-slate-500">لا توجد تيكتس في الفترة المحددة.</p>}
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
            {ticketStatuses.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select aria-label="المسؤول" value={assignedAdminId} onChange={(event) => {
            setSkip(0);
            setAssignedAdminId(event.target.value);
          }} className="rounded border px-3 py-2">
            <option value="">كل المسؤولين</option>
            {admins.filter((admin) => admin.isActive).map((admin) => (
              <option key={admin.id} value={admin.id}>{admin.fullName} · {admin.branch ?? "بدون فرع"}</option>
            ))}
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
                      case "id": cell = <span className="font-mono" title={ticket.id}>#{formatTicketCode(ticket.ticketNumber)}</span>; break;
                      case "title": cell = ticket.title; break;
                      case "requester": cell = <><div>{ticket.requester?.fullName ?? ticket.requesterName}</div>{ticket.requesterEmail && <div dir="ltr" className="text-xs text-slate-500">{ticket.requesterEmail}</div>}{ticket.requesterLocation && <div className="text-xs text-slate-500">{ticket.requesterLocation}</div>}{ticket.requesterPhone && <div dir="ltr" className="text-xs text-slate-500">{ticket.requesterPhone}</div>}</>; break;
                      case "status": cell = <span className={`rounded-full px-2 py-1 text-xs font-medium ${ticketStatusColors[ticket.status]}`}>{ticketStatusLabels[ticket.status]}</span>; break;
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
                      case "assignment": {
                        const pendingAssignment = ticket.transferRequests?.[0];
                        const selectedAdminId = assignments[ticket.id] ??
                          pendingAssignment?.targetAdminId ??
                          ticket.assignedAdminId ??
                          "";
                        const cancellingPending = Boolean(
                          pendingAssignment &&
                          selectedAdminId &&
                          selectedAdminId === ticket.assignedAdminId,
                        );
                        const alreadySelected = selectedAdminId === ticket.assignedAdminId &&
                          !cancellingPending;
                        cell = user.role !== "ADMIN" || !ticket.assignedAdminId
                          ? <div className="space-y-1">
                              <label className="block text-xs font-semibold">
                                إسناد المسؤول
                                <select
                                  aria-label={`إسناد المسؤول للتيكت ${formatTicketCode(ticket.ticketNumber)}`}
                                  value={selectedAdminId}
                                  onChange={(event) => setAssignments((current) => ({ ...current, [ticket.id]: event.target.value }))}
                                  className="mt-1 w-full rounded border px-2 py-2 text-sm font-normal"
                                >
                                  <option value="">اختر أدمن</option>
                                  {adminsForBranch(ticket.branch).map((admin) => (
                                    <option key={admin.id} value={admin.id}>{admin.fullName}</option>
                                  ))}
                                </select>
                              </label>
                              <div className="flex flex-col gap-2">
                                <button
                                  disabled={!selectedAdminId || alreadySelected || selectedAdminId === pendingAssignment?.targetAdminId}
                                  onClick={() => void assign(ticket)}
                                  className="w-full rounded border px-2 py-2 text-sm disabled:opacity-50"
                                >
                                  {cancellingPending
                                    ? "إلغاء النقل"
                                    : pendingAssignment || ticket.assignedAdminId
                                      ? "إعادة الإسناد"
                                      : "إسناد وإشعار"}
                                </button>
                              </div>
                              {pendingAssignment && (
                                <span className="text-xs text-amber-700">بانتظار تأكيد {pendingAssignment.targetName}</span>
                              )}
                            </div>
                          : "—";
                        break;
                      }
                    }
                    return <td key={column} className={`p-3 ${column === "timing" || column === "assignment" || column === "requester" ? "whitespace-normal break-words" : "truncate"}`}>{cell}</td>;
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
              <p className="text-sm text-slate-500">{admin.assignedTickets} تيكت مسند · متوسط الإغلاق {admin.averageResolutionMinutes ?? "—"} دقيقة</p>
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
