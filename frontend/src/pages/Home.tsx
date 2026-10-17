import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AppUser } from "../lib/api";
import { AdminDashboard } from "./AdminDashboard";
import { ManagerDashboard } from "./ManagerDashboard";

interface HomeProps {
  user: AppUser;
}

export function Home({ user }: HomeProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const canMonitor = user.role === "MANAGER" || user.role === "SUPER_ADMIN";
  const requestedSection = searchParams.get("section");
  const activeSection = requestedSection === "branches" && isAdmin
    ? "branches"
    : requestedSection === "manager" && canMonitor
      ? "manager"
      : canMonitor
        ? "manager"
        : "branches";

  useEffect(() => {
    if (requestedSection !== activeSection) {
      setSearchParams({ section: activeSection }, { replace: true });
    }
  }, [activeSection, requestedSection, setSearchParams]);

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold md:text-4xl">
        {activeSection === "manager" ? "لوحة متابعة المدير" : "إدارة تيكتس الفروع"}
      </h1>
      {activeSection === "branches" && isAdmin && <AdminDashboard user={user} />}
      {activeSection === "manager" && canMonitor && <ManagerDashboard user={user} />}
    </section>
  );
}
