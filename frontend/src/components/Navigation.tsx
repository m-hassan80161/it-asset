import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, LogOut, Settings as SettingsIcon, Ticket as TicketIcon, Users } from "lucide-react";
import { AppUser } from "../lib/api";

interface NavigationProps {
  user: AppUser;
  loggingOut: boolean;
  onLogout: () => void;
}

export function Navigation({ user, loggingOut, onLogout }: NavigationProps) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const canMonitor = user.role === "MANAGER" || user.role === "SUPER_ADMIN";
  const isEmployee = user.role === "EMPLOYEE";

  useEffect(() => {
    if (!accountMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !accountMenuRef.current?.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  return (
    <nav className="bg-blue-900 text-white shadow">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-5 px-4 py-4">
        <Link to="/" className="text-lg font-bold text-white hover:text-blue-100">IT Asset Platform</Link>
        <Link to="/tickets" className="inline-flex items-center gap-1 text-white hover:text-blue-100">
          <TicketIcon className="h-4 w-4" /> {isEmployee ? "My Tickets" : "Tickets"}
        </Link>
        {isEmployee && <Link to="/tickets/new" className="text-white hover:text-blue-100">New Ticket</Link>}
        {user.role === "ADMIN" && <Link to="/admin/tickets" className="text-white hover:text-blue-100">Branch Tickets</Link>}
        {(user.role === "ADMIN" || user.role === "EMPLOYEE") && <Link to="/users" className="text-white hover:text-blue-100">{user.role === "EMPLOYEE" ? "My Account" : "Branch Employees"}</Link>}
        {isAdmin && (
          <>
            <Link to="/devices" className="text-white hover:text-blue-100">Devices</Link>
            <Link to="/software" className="text-white hover:text-blue-100">Software</Link>
            <Link to="/onboarding" className="text-white hover:text-blue-100">Onboarding</Link>
          </>
        )}
        {user.role === "SUPER_ADMIN" && <Link to="/devices/branch-rules" className="text-white hover:text-blue-100">Device Branch Rules</Link>}
        {canMonitor && <Link to="/manager/dashboard" className="text-white hover:text-blue-100">Dashboard</Link>}
        {canMonitor && <Link to="/manager/logs" className="text-white hover:text-blue-100">System Logs</Link>}
        {user.role === "SUPER_ADMIN" && <Link to="/users" className="inline-flex items-center gap-1 text-white hover:text-blue-100"><Users className="h-4 w-4" /> Accounts</Link>}
        <div ref={accountMenuRef} className="relative ml-auto min-w-max">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            onClick={() => setAccountMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded px-2 py-1 text-right hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-white"
          >
            <span>
              <span className="block font-semibold leading-tight">{user.fullName}</span>
              <span className="block text-xs text-blue-200" dir="ltr">@{user.username}</span>
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${accountMenuOpen ? "rotate-180" : ""}`} />
          </button>
          {accountMenuOpen && (
            <div role="menu" className="absolute right-0 z-50 mt-2 min-w-48 overflow-hidden rounded-md bg-white py-1 text-right text-sm text-slate-800 shadow-lg ring-1 ring-black/10">
              <Link
                to="/settings"
                role="menuitem"
                onClick={() => setAccountMenuOpen(false)}
                className="flex items-center gap-2 px-4 py-2 hover:bg-slate-100"
              >
                <SettingsIcon className="h-4 w-4" /> Settings
              </Link>
            <button
              type="button"
              role="menuitem"
              onClick={onLogout}
              disabled={loggingOut}
              className="flex w-full items-center gap-2 px-4 py-2 hover:bg-slate-100 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? "Signing out..." : "Sign out"}
            </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
