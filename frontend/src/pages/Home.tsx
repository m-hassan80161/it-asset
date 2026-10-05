import { useEffect, useState } from "react";
import { inventoryApi, adApi } from "../lib/api";
import { AlertCircle, Users, HardDrive } from "lucide-react";

export function Home() {
  const [stats, setStats] = useState({
    deviceCount: 0,
    userCount: 0,
    lastSync: "—",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadStats = async () => {
      try {
        // ✅ استدعي الـ APIs الصحيحة فقط
        const [devicesRes, usersRes] = await Promise.all([
          inventoryApi.list(0, 999),
          adApi.listUsers(false),
        ]);

        setStats({
          deviceCount: devicesRes.data.length,
          userCount: usersRes.data.length,
          lastSync: new Date().toLocaleDateString(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  if (loading) return <div className="p-4">Loading dashboard...</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;

  return (
    <div className="p-6">
      <h1 className="text-4xl font-bold mb-8">IT Asset Management Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {/* Devices Card */}
        <div className="bg-white p-6 rounded shadow hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-4">
            <HardDrive className="w-8 h-8 text-blue-600" />
            <h2 className="text-xl font-semibold">Total Devices</h2>
          </div>
          <p className="text-4xl font-bold text-blue-600">{stats.deviceCount}</p>
        </div>

        {/* Users Card */}
        <div className="bg-white p-6 rounded shadow hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-4">
            <Users className="w-8 h-8 text-green-600" />
            <h2 className="text-xl font-semibold">Active Users</h2>
          </div>
          <p className="text-4xl font-bold text-green-600">{stats.userCount}</p>
        </div>

        {/* Last Sync Card */}
        <div className="bg-white p-6 rounded shadow hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-8 h-8 text-orange-600" />
            <h2 className="text-xl font-semibold">Last Sync</h2>
          </div>
          <p className="text-xl font-semibold text-orange-600">{stats.lastSync}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded shadow">
        <h2 className="text-2xl font-semibold mb-4">Getting Started</h2>
        <ul className="space-y-3 text-slate-700">
          <li>
            📊 <strong>View Devices:</strong> Monitor hardware inventory from the Devices tab.
          </li>
          <li>
            👥 <strong>Active Directory:</strong> Manage users, groups, and organizational units.
          </li>
          <li>
            👤 <strong>Onboarding:</strong> Automate new employee provisioning across AD and file servers.
          </li>
          <li>
            💾 <strong>File Server:</strong> Manage department folders and NTFS permissions.
          </li>
        </ul>
      </div>
    </div>
  );
}