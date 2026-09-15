import { Routes, Route, Link } from "react-router-dom";
import { Home } from "./pages/Home";
import { DeviceList } from "./pages/DeviceList";
import { DeviceDetail } from "./pages/DeviceDetail";
import { OnboardingWizard } from "./pages/OnboardingWizard";
import { ComplianceAlerts } from "./pages/ComplianceAlerts";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-blue-900 text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex gap-6">
          <Link to="/" className="font-bold text-lg hover:text-blue-100">
            IT Asset Platform
          </Link>
          <Link to="/devices" className="hover:text-blue-100">
            Devices
          </Link>
          <Link to="/compliance" className="hover:text-blue-100">
            Compliance Alerts
          </Link>
          <Link to="/onboarding" className="hover:text-blue-100">
            Onboarding
          </Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/devices" element={<DeviceList />} />
          <Route path="/devices/:id" element={<DeviceDetail />} />
          <Route path="/compliance" element={<ComplianceAlerts />} />
          <Route path="/onboarding" element={<OnboardingWizard />} />
        </Routes>
      </main>
    </div>
  );
}
