import { useEffect, useState } from "react";
import { inventoryApi, complianceApi, adApi } from "../lib/api";
import { AlertCircle, Users, HardDrive, AlertTriangle } from "lucide-react";

export function Home() {
  const [stats, setStats] = useState({
    deviceCount: 0,
    nonCompliantCount: 0,
    openAlerts: 0,
    userCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [devicesRes, alertsRes, usersRes] = await Promise.all([
          inventoryApi.list(0, 999),
          complianceApi.alerts(),
          adApi.listUsers(false),
        ]);

        const nonCompliant = devicesRes.data.filter((d: any) =>
          d._count?.complianceAlerts > 0
        ).length;

        setStats({
          deviceCount: devicesRes.data.length,
          nonCompliantCount: nonCompliant,
          openAlerts: alertsRes.data.length,
          userCount: usersRes.data.length,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  if (loading) return <div>Loading dashboard...</div>;
  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <h1 className="text-4xl font-bold mb-8">IT Asset Management Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        {/* Devices Card */}
        <div className="bg-white p-6 rounded shadow hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-4">
            <HardDrive className="w-8 h-8 text-blue-600" />
            <h2 className="text-xl font-semibold">Total Devices</h2>
          </div>
          <p className="text-4xl font-bold text-blue-600">{stats.deviceCount}</p>
        </div>

        {/* Non-Compliant Card */}
        <div className="bg-white p-6 rounded shadow hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-8 h-8 text-orange-600" />
            <h2 className="text-xl font-semibold">Non-Compliant</h2>
          </div>
          <p className="text-4xl font-bold text-orange-600">{stats.nonCompliantCount}</p>
        </div>

        {/* Alerts Card */}
        <div className="bg-white p-6 rounded shadow hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
            <h2 className="text-xl font-semibold">Open Alerts</h2>
          </div>
          <p className="text-4xl font-bold text-red-600">{stats.openAlerts}</p>
        </div>

        {/* Users Card */}
        <div className="bg-white p-6 rounded shadow hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-4">
            <Users className="w-8 h-8 text-green-600" />
            <h2 className="text-xl font-semibold">Active Users</h2>
          </div>
          <p className="text-4xl font-bold text-green-600">{stats.userCount}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded shadow">
        <h2 className="text-2xl font-semibold mb-4">Getting Started</h2>
        <ul className="space-y-3 text-slate-700">
          <li>
            📊 <strong>View Devices:</strong> Monitor hardware inventory and compliance status from the Devices tab.
          </li>
          <li>
            🔔 <strong>Compliance Alerts:</strong> Check software update recommendations and non-compliant devices.
          </li>
          <li>
            👤 <strong>Onboarding:</strong> Automate new employee provisioning across AD, file servers, and mailboxes.
          </li>
          <li>
            🔗 <strong>AD Sync:</strong> Synchronize users, groups, and organizational units from Active Directory.
          </li>
        </ul>
      </div>
    </div>
  );
}
