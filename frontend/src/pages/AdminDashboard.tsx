import { useCallback, useEffect, useRef, useState } from "react";
import { AppUser, Ticket, TicketCategory, TicketPriority, TicketStatus } from "../lib/api";
import { TicketFilters, ticketsApi } from "../lib/ticketsApi";
import { TicketCard } from "../components/TicketCard";
import { ManagedAdmin } from "../lib/api";

interface AdminDashboardProps {
  user: AppUser;
}

const priorities: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const categories: TicketCategory[] = ["HARDWARE", "SOFTWARE", "NETWORK", "PRINTER", "OTHER"];
const statuses: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"];

export function AdminDashboard({ user }: AdminDashboardProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [dashboard, setDashboard] = useState({
    branch: null as string | null,
    open: 0,
    inProgress: 0,
    waitingUser: 0,
    high: 0,
    urgent: 0,
  });
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [priority, setPriority] = useState<TicketPriority | "">("");
  const [category, setCategory] = useState<TicketCategory | "">("");
  const [sortBy, setSortBy] = useState<TicketFilters["sortBy"]>("createdAt");
  const [sortOrder, setSortOrder] = useState<TicketFilters["sortOrder"]>("desc");
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);
  const [transferTargets, setTransferTargets] = useState<Array<Pick<ManagedAdmin, "id" | "username" | "fullName" | "branch">>>([]);
  const [transferInbox, setTransferInbox] = useState<Array<{
    id: string;
    requesterName: string;
    requesterUsername: string;
    message: string | null;
    createdAt: string;
    ticket: Pick<Ticket, "id" | "title" | "branch" | "status" | "priority">;
  }>>([]);
  const [transferTargetByTicket, setTransferTargetByTicket] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [newOpenTickets, setNewOpenTickets] = useState(0);
  const [loading, setLoading] = useState(true);
  const previousOpen = useRef<number | null>(null);

  const loadData = useCallback(async () => {
    setError("");
    const filters = {
      status: status || undefined,
      priority: priority || undefined,
      category: category || undefined,
      sortBy,
      sortOrder,
      skip,
      take: 25,
    } satisfies TicketFilters;
    try {
      const listCall = user.role === "ADMIN"
        ? ticketsApi.branch(user.branch ?? "", filters)
        : ticketsApi.list(filters);
      const [listResponse, dashboardResponse, inboxResponse, targetsResponse] = await Promise.all([
        listCall,
        ticketsApi.adminDashboard(),
        user.role === "ADMIN" ? ticketsApi.transferInbox() : Promise.resolve({ data: [] }),
        user.role === "ADMIN" ? ticketsApi.transferTargets() : Promise.resolve({ data: [] }),
      ]);
      setTickets(listResponse.data.data);
      setTotal(listResponse.data.total);
      if (previousOpen.current !== null && dashboardResponse.data.open > previousOpen.current) {
        setNewOpenTickets(dashboardResponse.data.open - previousOpen.current);
      }
      previousOpen.current = dashboardResponse.data.open;
      setDashboard(dashboardResponse.data);
      setTransferInbox(inboxResponse.data);
      setTransferTargets(targetsResponse.data);
    } catch {
      setError("تعذر تحميل تيكتس الفرع أو إحصائياته.");
    } finally {
      setLoading(false);
    }
  }, [category, priority, skip, sortBy, sortOrder, status, user.branch, user.role]);

  useEffect(() => {
    void loadData();
    const interval = window.setInterval(() => void loadData(), 15_000);
    return () => window.clearInterval(interval);
  }, [loadData]);

  const cards = [
    ["مفتوحة", dashboard.open],
    ["قيد المعالجة", dashboard.inProgress],
    ["بانتظار الموظف", dashboard.waitingUser],
    ["أولوية عالية", dashboard.high],
    ["عاجلة", dashboard.urgent],
  ];

  const transferTicket = async (ticket: Ticket) => {
    const targetAdminId = transferTargetByTicket[ticket.id];
    if (!targetAdminId) return;
    setError("");
    try {
      await ticketsApi.requestTransfer(ticket.id, targetAdminId);
      setTransferTargetByTicket((current) => ({ ...current, [ticket.id]: "" }));
      await loadData();
    } catch {
      setError("تعذر إرسال طلب النقل إلى الأدمن المحدد.");
    }
  };

  const respondToTransfer = async (requestId: string, approve: boolean) => {
    setError("");
    try {
      await ticketsApi.respondToTransfer(requestId, approve);
      await loadData();
    } catch {
      setError("تعذر الرد على طلب نقل التيكت.");
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">إدارة تيكتس الفرع</h1>
        <p className="mt-2 text-slate-600">الفرع: {dashboard.branch ?? user.branch ?? "كل الفروع"}</p>
      </header>
      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}
      {newOpenTickets > 0 && (
        <p role="status" className="rounded bg-amber-100 p-3 text-amber-900">
          وصل {newOpenTickets} طلب جديد إلى نطاق الفرع خلال آخر تحديث.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white p-5 shadow">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold text-blue-800">{value}</p>
          </div>
        ))}
      </div>
      {user.role === "ADMIN" && transferInbox.length > 0 && (
        <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-semibold">طلبات نقل تيكتس إليك ({transferInbox.length})</h2>
          {transferInbox.map((request) => (
            <article key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded bg-white p-4">
              <div>
                <p className="font-semibold">{request.ticket.title} · {request.ticket.branch}</p>
                <p className="text-sm text-slate-600">
                  من {request.requesterName} ({request.requesterUsername}) · {new Date(request.createdAt).toLocaleString()}
                </p>
                {request.message && <p className="mt-1 text-sm">{request.message}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => void respondToTransfer(request.id, true)} className="rounded bg-green-700 px-3 py-1 text-white">قبول النقل</button>
                <button onClick={() => void respondToTransfer(request.id, false)} className="rounded border border-red-300 px-3 py-1 text-red-700">رفض</button>
              </div>
            </article>
          ))}
        </section>
      )}
      <div className="grid gap-3 rounded-lg bg-white p-4 shadow sm:grid-cols-2 lg:grid-cols-5">
        <select aria-label="تصفية الحالة" value={status} onChange={(event) => { setSkip(0); setStatus(event.target.value as TicketStatus | ""); }} className="rounded border px-3 py-2">
          <option value="">كل الحالات</option>
          {statuses.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="تصفية الأولوية" value={priority} onChange={(event) => { setSkip(0); setPriority(event.target.value as TicketPriority | ""); }} className="rounded border px-3 py-2">
          <option value="">كل الأولويات</option>
          {priorities.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="تصفية التصنيف" value={category} onChange={(event) => { setSkip(0); setCategory(event.target.value as TicketCategory | ""); }} className="rounded border px-3 py-2">
          <option value="">كل التصنيفات</option>
          {categories.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="ترتيب حسب" value={sortBy} onChange={(event) => setSortBy(event.target.value as TicketFilters["sortBy"])} className="rounded border px-3 py-2">
          <option value="createdAt">تاريخ الإنشاء</option>
          <option value="priority">الأولوية</option>
        </select>
        <select aria-label="اتجاه الترتيب" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as TicketFilters["sortOrder"])} className="rounded border px-3 py-2">
          <option value="desc">تنازلي</option>
          <option value="asc">تصاعدي</option>
        </select>
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">تيكتس الفرع ({total})</h2>
        <div className="flex gap-2">
          <button disabled={!skip} onClick={() => setSkip(Math.max(0, skip - 25))} className="rounded border px-3 py-1 disabled:opacity-50">السابق</button>
          <button disabled={skip + tickets.length >= total} onClick={() => setSkip(skip + 25)} className="rounded border px-3 py-1 disabled:opacity-50">التالي</button>
        </div>
      </div>
      {loading ? <p>جارٍ تحميل التيكتس...</p> : tickets.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-slate-600 shadow">لا توجد تيكتس مطابقة.</p>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="space-y-3">
              <TicketCard ticket={ticket} user={user} mode="admin" onRefresh={loadData} onError={setError} />
              {user.role === "ADMIN" && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 shadow">
                  <label className="text-sm">طلب نقل إلى أي أدمن (يتطلب موافقته)
                    <select
                      aria-label={`أدمن مستلم للتيكت ${ticket.id}`}
                      value={transferTargetByTicket[ticket.id] ?? ""}
                      onChange={(event) => setTransferTargetByTicket((current) => ({ ...current, [ticket.id]: event.target.value }))}
                      className="ml-2 rounded border px-2 py-1"
                    >
                      <option value="">اختر الأدمن</option>
                      {transferTargets.filter((target) => target.id !== user.id && target.id !== ticket.assignedAdminId).map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.fullName} ({target.branch ?? "بدون فرع"})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={!transferTargetByTicket[ticket.id]}
                    onClick={() => void transferTicket(ticket)}
                    className="rounded border border-amber-700 px-3 py-1 text-amber-800 disabled:opacity-50"
                  >
                    إرسال طلب نقل
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
