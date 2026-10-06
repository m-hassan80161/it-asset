import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { authApi } from "./lib/api";
import { DeviceDetail } from "./pages/DeviceDetail";
import { DeviceList } from "./pages/DeviceList";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { OnboardingWizard } from "./pages/OnboardingWizard";
import { Settings } from "./pages/Settings";
import { SoftwareInventory } from "./pages/SoftwareInventory";

type AuthState = "checking" | "authenticated" | "unauthenticated" | "error";

export default function App() {
  const location = useLocation();
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [authError, setAuthError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const checkSession = () => {
    setAuthState("checking");
    setAuthError("");
    authApi.me()
      .then(() => setAuthState("authenticated"))
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
        onLogin={() => setAuthState("authenticated")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-blue-900 text-white shadow">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-5 px-4 py-4">
          <Link to="/" className="text-lg font-bold text-white hover:text-blue-100">
            IT Asset Platform
          </Link>
          <Link to="/devices" className="text-white hover:text-blue-100">
            Devices
          </Link>
          <Link to="/software" className="text-white hover:text-blue-100">
            Software
          </Link>
          <Link to="/onboarding" className="text-white hover:text-blue-100">
            Onboarding
          </Link>
          <Link to="/settings" className="inline-flex items-center gap-1 text-white hover:text-blue-100">
            <SettingsIcon className="h-4 w-4" />
            Settings
          </Link>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="ml-auto inline-flex items-center gap-2 text-white hover:text-blue-100 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {loggingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </nav>

      {authError && (
        <div role="alert" className="mx-auto mt-4 max-w-7xl rounded bg-red-100 p-3 text-red-700">
          {authError}
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/devices" element={<DeviceList />} />
          <Route path="/devices/:id" element={<DeviceDetail />} />
          <Route path="/software" element={<SoftwareInventory />} />
          <Route path="/onboarding" element={<OnboardingWizard />} />
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
