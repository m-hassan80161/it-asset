import { useEffect, useState } from "react";
import { complianceApi } from "../lib/api";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Alert {
  id: string;
  softwareName: string;
  newVersion: string;
  laggingCount: number;
  message: string;
  device: { computerName: string };
  createdAt: string;
}

export function ComplianceAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const res = await complianceApi.alerts();
      setAlerts(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  if (loading) return <div>Loading compliance alerts...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Compliance Alerts</h1>
        <button
          onClick={loadAlerts}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && <div className="text-red-600 mb-4">{error}</div>}

      {alerts.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded p-8 text-center">
          <div className="text-green-600 text-lg font-semibold">✓ No Active Alerts</div>
          <div className="text-green-700 mt-2">All devices are in compliance!</div>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div key={alert.id} className="bg-white p-6 rounded shadow border-l-4 border-orange-500">
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
                <div className="flex-grow">
                  <h2 className="font-semibold text-lg">
                    {alert.softwareName} v{alert.newVersion}
                  </h2>
                  <p className="text-slate-700 mt-1">{alert.message}</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
                    <div>
                      <strong>Device:</strong> {alert.device.computerName}
                    </div>
                    <div>
                      <strong>Lagging Devices:</strong> {alert.laggingCount}
                    </div>
                    <div>
                      <strong>Reported:</strong> {new Date(alert.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
