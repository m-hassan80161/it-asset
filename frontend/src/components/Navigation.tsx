import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ChevronDown, LayoutDashboard, LogOut, Menu, Settings as SettingsIcon, Ticket as TicketIcon, X } from "lucide-react";
import { AppUser } from "../lib/api";

interface NavigationProps {
  user: AppUser;
  loggingOut: boolean;
  onLogout: () => void;
}

export function Navigation({ user, loggingOut, onLogout }: NavigationProps) {
  const location = useLocation();
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const canMonitor = user.role === "MANAGER" || user.role === "SUPER_ADMIN";
  const isEmployee = user.role === "EMPLOYEE";

  useEffect(() => {
    if (!settingsMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !settingsMenuRef.current?.contains(event.target)) {
        setSettingsMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsMenuOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
      isActive ? "bg-blue-800 font-semibold text-white" : "text-blue-100 hover:bg-blue-800/70 hover:text-white"
    }`;
  const activeTicketSection = new URLSearchParams(location.search).get("section") ??
    (canMonitor ? "manager" : "branches");

  return (
    <>
      <button
        type="button"
        aria-label={mobileMenuOpen ? "إغلاق القائمة" : "فتح القائمة"}
        aria-expanded={mobileMenuOpen}
        onClick={() => setMobileMenuOpen((open) => !open)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-blue-900 p-2 text-white shadow md:hidden"
      >
        {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="إغلاق القائمة"
          onClick={closeMobileMenu}
          className="fixed inset-0 z-30 bg-slate-950/40 md:hidden"
        />
      )}
      <nav
        aria-label="التنقل الرئيسي"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-blue-950 text-white shadow-xl transition-transform duration-200 md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Link to={canMonitor || isAdmin ? "/manager/dashboard" : "/tickets"} onClick={closeMobileMenu} className="border-b border-blue-800 px-5 py-6 text-lg font-bold text-white hover:bg-blue-900">
          IT Asset Platform
        </Link>

        <div className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {(isAdmin || canMonitor) && (
            <div aria-label="لوحات المتابعة" className="space-y-1">
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-blue-300">لوحات التيكتس</p>
              {canMonitor && (
                <Link
                  to="/manager/dashboard?section=manager"
                  onClick={closeMobileMenu}
                  aria-current={location.pathname === "/manager/dashboard" && activeTicketSection === "manager" ? "page" : undefined}
                  className={navLinkClass({ isActive: location.pathname === "/manager/dashboard" && activeTicketSection === "manager" })}
                >
                  <LayoutDashboard className="h-4 w-4 shrink-0" /> لوحة متابعة المدير
                </Link>
              )}
              {isAdmin && (
                <Link
                  to="/manager/dashboard?section=branches"
                  onClick={closeMobileMenu}
                  aria-current={location.pathname === "/manager/dashboard" && activeTicketSection === "branches" ? "page" : undefined}
                  className={navLinkClass({ isActive: location.pathname === "/manager/dashboard" && activeTicketSection === "branches" })}
                >
                  <TicketIcon className="h-4 w-4 shrink-0" /> إدارة تيكتس الفروع
                </Link>
              )}
            </div>
          )}

          {isAdmin && (
            <div className="space-y-1 pt-4">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-blue-300">الأصول</p>
              <NavLink to="/devices" onClick={closeMobileMenu} className={navLinkClass}>الأجهزة</NavLink>
              <NavLink to="/software" onClick={closeMobileMenu} className={navLinkClass}>البرامج</NavLink>
              <NavLink to="/onboarding" onClick={closeMobileMenu} className={navLinkClass}>تهيئة الموظفين</NavLink>
            </div>
          )}

          {(user.role === "SUPER_ADMIN" || canMonitor || user.role === "ADMIN" || isEmployee) && (
            <div ref={settingsMenuRef} className="space-y-1 pt-4">
              <button
                type="button"
                aria-expanded={settingsMenuOpen}
                onClick={() => setSettingsMenuOpen((open) => !open)}
                className="flex w-full items-center justify-between rounded px-3 py-2 text-xs font-semibold uppercase tracking-wide text-blue-300 hover:bg-blue-900"
              >
                <span className="flex items-center gap-2"><SettingsIcon className="h-4 w-4" /> الإعدادات</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${settingsMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {settingsMenuOpen && (
                <div className="space-y-1 border-l border-blue-800 pl-2">
                  <NavLink to="/settings" onClick={() => { setSettingsMenuOpen(false); closeMobileMenu(); }} className={navLinkClass}>إعدادات الحساب</NavLink>
                  {(user.role === "ADMIN" || isEmployee) && (
                    <NavLink to="/users" onClick={closeMobileMenu} className={navLinkClass}>
                      {isEmployee ? "حسابي" : "موظفو الفرع"}
                    </NavLink>
                  )}
                  {user.role === "SUPER_ADMIN" && (
                    <>
                      <NavLink to="/devices/branch-rules" onClick={closeMobileMenu} className={navLinkClass}>الفروع وقواعد الأجهزة</NavLink>
                      <NavLink to="/users" onClick={closeMobileMenu} className={navLinkClass}>الحسابات</NavLink>
                      <NavLink to="/manager/logs" onClick={closeMobileMenu} className={navLinkClass}>سجلات النظام</NavLink>
                      <NavLink to="/users/cpanel" onClick={closeMobileMenu} className={navLinkClass}>صناديق cPanel</NavLink>
                    </>
                  )}
                  {canMonitor && user.role !== "SUPER_ADMIN" && (
                    <NavLink to="/manager/logs" onClick={closeMobileMenu} className={navLinkClass}>سجلات النظام</NavLink>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-blue-800 p-4">
          <span className="block truncate font-semibold">{user.fullName}</span>
          <span className="block truncate text-xs text-blue-300" dir="ltr">@{user.username}</span>
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            className="mt-3 inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-blue-100 hover:bg-blue-900 hover:text-white disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {loggingOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}
          </button>
        </div>
      </nav>
    </>
  );
}
