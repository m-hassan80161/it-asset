import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { inventoryApi } from "../lib/api";
import { ChevronRight, AlertTriangle } from "lucide-react";

interface Device {
  id: string;
  computerName: string;
  loggedInUser?: string;
  osName?: string;
  osVersion?: string;
  lastSeenAt: string;
  _count?: { complianceAlerts: number };
}

export function DeviceList() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [skip, setSkip] = useState(0);
  const take = 20;

  useEffect(() => {
    const loadDevices = async () => {
      try {
        setLoading(true);
        const res = await inventoryApi.list(skip, take);
        setDevices(res.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load devices");
      } finally {
        setLoading(false);
      }
    };

    loadDevices();
  }, [skip]);

  if (loading) return <div>Loading devices...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Managed Devices</h1>

      {error && <div className="text-red-600 mb-4">{error}</div>}

      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100 border-b">
            <tr>
              <th className="text-left px-6 py-3">Computer Name</th>
              <th className="text-left px-6 py-3">User</th>
              <th className="text-left px-6 py-3">OS</th>
              <th className="text-left px-6 py-3">Last Seen</th>
              <th className="text-center px-6 py-3">Alerts</th>
              <th className="text-center px-6 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.id} className="border-b hover:bg-slate-50 transition">
                <td className="px-6 py-4 font-medium">{device.computerName}</td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {device.loggedInUser || "—"}
                </td>
                <td className="px-6 py-4 text-sm">
                  {device.osName} {device.osVersion ? `(${device.osVersion})` : ""}
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">
                  {new Date(device.lastSeenAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  {device._count?.complianceAlerts ? (
                    <span className="flex items-center justify-center gap-1 bg-red-100 text-red-800 px-3 py-1 rounded text-sm font-medium">
                      <AlertTriangle className="w-4 h-4" />
                      {device._count.complianceAlerts}
                    </span>
                  ) : (
                    <span className="text-green-600 font-medium">✓ OK</span>
                  )}
                </td>
                <td className="px-6 py-4 text-center">
                  <button
                    onClick={() => navigate(`/devices/${device.id}`)}
                    className="text-blue-600 hover:text-blue-900 inline-flex items-center gap-1"
                  >
                    View
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-6 flex gap-2 justify-center">
        <button
          onClick={() => setSkip(Math.max(0, skip - take))}
          disabled={skip === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-slate-300"
        >
          Previous
        </button>
        <span className="px-4 py-2 text-slate-600">
          Showing {skip + 1} to {skip + devices.length}
        </span>
        <button
          onClick={() => setSkip(skip + take)}
          disabled={devices.length < take}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-slate-300"
        >
          Next
        </button>
      </div>
    </div>
  );
}
