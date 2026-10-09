import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppUser, Ticket, TicketStatus } from "../lib/api";
import { ticketsApi } from "../lib/ticketsApi";
import { TicketCard } from "../components/TicketCard";
import { TicketForm } from "../components/TicketForm";

interface EmployeeTicketsProps {
  user: AppUser;
  create?: boolean;
}

export function EmployeeTickets({ user, create = false }: EmployeeTicketsProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadTickets = useCallback(async () => {
    setError("");
    try {
      const { data } = await ticketsApi.list({ take: 100, status: status || undefined });
      setTickets(data.data);
    } catch {
      setError("تعذر تحميل طلباتك.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  if (create) {
    return (
      <section className="mx-auto max-w-3xl space-y-5">
        <Link to="/tickets" className="text-blue-700 hover:underline">← العودة إلى طلباتي</Link>
        <h1 className="text-3xl font-bold">طلب دعم جديد</h1>
        <TicketForm branch={user.branch ?? ""} onCreated={loadTickets} />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">طلباتي</h1>
          <p className="mt-2 text-slate-600">تابع حالة الطلبات وتواصل مع فريق الدعم.</p>
        </div>
        <Link to="/tickets/new" className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800">طلب جديد</Link>
      </header>
      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}
      <label className="inline-flex items-center gap-2 text-sm">
        تصفية الحالة
        <select value={status} onChange={(event) => setStatus(event.target.value as TicketStatus | "")} className="rounded border px-3 py-2">
          <option value="">كل الحالات</option>
          {["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"].map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      {loading ? <p>جارٍ تحميل الطلبات...</p> : tickets.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-slate-600 shadow">لا توجد طلبات مطابقة.</p>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} user={user} mode="employee" onRefresh={loadTickets} onError={setError} />
          ))}
        </div>
      )}
    </section>
  );
}
