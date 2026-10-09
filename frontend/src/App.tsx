import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { authApi } from "./lib/api";
import { AppUser } from "./lib/api";
import { AdminDashboard } from "./pages/AdminDashboard";
import { BranchPatternSettings } from "./pages/BranchPatternSettings";
import { EmployeeTickets } from "./pages/EmployeeTickets";
import { SystemLogs } from "./pages/SystemLogs";
import { DeviceDetail } from "./pages/DeviceDetail";
import { DeviceList } from "./pages/DeviceList";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { OnboardingWizard } from "./pages/OnboardingWizard";
import { Settings } from "./pages/Settings";
import { SoftwareInventory } from "./pages/SoftwareInventory";
import { ManagerDashboard } from "./pages/ManagerDashboard";
import { LocalUsers } from "./pages/LocalUsers";
import { Navigation } from "./components/Navigation";

type AuthState = "checking" | "authenticated" | "unauthenticated" | "error";

export default function App() {
  const location = useLocation();
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const checkSession = () => {
    setAuthState("checking");
    setAuthError("");
    authApi.me()
      .then(({ data }) => {
        setCurrentUser(data);
        setAuthState("authenticated");
      })
      .catch((error: { response?: { status?: number } }) => {
        if (error.response?.status === 401) {
          setAuthState("unauthenticated");
        } else {
          setAuthError("تعذر الاتصال بالخادم للتحقق من تسجيل الدخول.");
          setAuthState("error");
        }
      });
  };

  useEffect(() => {
    checkSession();
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    setAuthError("");
    try {
      await authApi.logout();
      setCurrentUser(null);
      setAuthState("unauthenticated");
    } catch {
      setAuthError("تعذر تسجيل الخروج. تحقق من اتصال الخادم وحاول مرة أخرى.");
    } finally {
      setLoggingOut(false);
    }
  };

  if (authState === "checking") {
    return <div className="p-6 text-center">Checking your session...</div>;
  }

  if (authState === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-lg bg-white p-6 text-center shadow">
          <p role="alert" className="mb-4 text-red-700">{authError}</p>
          <button
            onClick={checkSession}
            className="rounded bg-blue-700 px-4 py-2 text-white hover:bg-blue-800"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <Login
        key={location.pathname}
        onLogin={checkSession}
      />
    );
  }
  if (!currentUser) return <div role="alert" className="p-6 text-center text-red-700">تعذر تحميل بيانات المستخدم.</div>;

  const isAdmin = currentUser.role === "ADMIN" || currentUser.role === "SUPER_ADMIN";
  const canMonitor = currentUser.role === "MANAGER" || currentUser.role === "SUPER_ADMIN";

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation user={currentUser} loggingOut={loggingOut} onLogout={handleLogout} />

      {authError && (
        <div role="alert" className="mx-auto mt-4 max-w-7xl rounded bg-red-100 p-3 text-red-700">
          {authError}
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-8">
        <Routes>
          <Route path="/" element={isAdmin ? <Home /> : <Navigate to="/tickets" replace />} />
          <Route path="/tickets" element={
            currentUser.role === "EMPLOYEE"
              ? <EmployeeTickets user={currentUser} />
              : currentUser.role === "ADMIN" || currentUser.role === "SUPER_ADMIN"
                ? <AdminDashboard user={currentUser} />
                : <Navigate to="/manager/dashboard" replace />
          } />
          <Route path="/tickets/new" element={
            currentUser.role === "EMPLOYEE"
              ? <EmployeeTickets user={currentUser} create />
              : <Navigate to="/tickets" replace />
          } />
          <Route path="/admin/tickets" element={
            currentUser.role === "ADMIN" || currentUser.role === "SUPER_ADMIN"
              ? <AdminDashboard user={currentUser} />
              : <Navigate to="/tickets" replace />
          } />
          <Route path="/manager/dashboard" element={canMonitor ? <ManagerDashboard user={currentUser} /> : <Navigate to="/tickets" replace />} />
          <Route path="/manager/logs" element={canMonitor ? <SystemLogs /> : <Navigate to="/tickets" replace />} />
          <Route path="/monitoring" element={<Navigate to="/manager/dashboard" replace />} />
          <Route path="/users" element={currentUser.role === "MANAGER" ? <Navigate to="/tickets" replace /> : <LocalUsers user={currentUser} onCredentialsChanged={() => {
            setCurrentUser(null);
            setAuthState("unauthenticated");
          }} />} />
          <Route path="/logs" element={canMonitor ? <Navigate to="/manager/logs" replace /> : <Navigate to="/tickets" replace />} />
          <Route path="/devices/branch-rules" element={currentUser.role === "SUPER_ADMIN" ? <BranchPatternSettings /> : <Navigate to="/devices" replace />} />
          <Route path="/devices" element={isAdmin ? <DeviceList user={currentUser} /> : <Navigate to="/tickets" replace />} />
          <Route path="/devices/:id" element={isAdmin ? <DeviceDetail /> : <Navigate to="/tickets" replace />} />
          <Route path="/software" element={isAdmin ? <SoftwareInventory /> : <Navigate to="/tickets" replace />} />
          <Route path="/onboarding" element={isAdmin ? <OnboardingWizard /> : <Navigate to="/tickets" replace />} />
          <Route
            path="/settings"
            element={<Settings onCredentialsChanged={() => setAuthState("unauthenticated")} />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
