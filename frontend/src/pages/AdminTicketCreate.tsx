import { Link, useNavigate } from "react-router-dom";
import { AppUser } from "../lib/api";
import { TicketForm } from "../components/TicketForm";

interface AdminTicketCreateProps {
  user: AppUser;
}

export function AdminTicketCreate({ user }: AdminTicketCreateProps) {
  const navigate = useNavigate();

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <Link to="/admin/tickets" className="inline-block text-blue-700 hover:underline">
        العودة إلى سجل التيكتس
      </Link>
      <h1 className="text-3xl font-bold">فتح تيكت جديد</h1>
      <TicketForm
        callTicketMode
        branch={user.branch ?? ""}
        showBranch={user.role === "SUPER_ADMIN"}
        onCreated={async () => navigate("/admin/tickets")}
      />
    </section>
  );
}
