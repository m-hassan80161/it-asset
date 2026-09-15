import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { inventoryApi } from "../lib/api";
import { ArrowLeft, AlertCircle } from "lucide-react";

export function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [device, setDevice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadDevice = async () => {
      if (!id) {
        setError("No device ID provided");
        return;
      }
      try {
        const res = await inventoryApi.detail(id);
        setDevice(res.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load device");
      } finally {
        setLoading(false);
      }
    };

    loadDevice();
  }, [id]);

  if (loading) return <div>Loading device details...</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!device) return <div>Device not found</div>;

  return (
    <div>
      <button
        onClick={() => navigate("/devices")}
        className="flex items-center gap-2 text-blue-600 hover:text-blue-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Devices
      </button>

      <h1 className="text-3xl font-bold mb-8">{device.computerName}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hardware Info */}
        <div className="bg-white p-6 rounded shadow">
          <h2 className="text-xl font-semibold mb-4">Hardware</h2>
          <div className="space-y-3 text-sm">
            <div>
              <strong>User:</strong> {device.loggedInUser || "—"}
            </div>
            <div>
              <strong>OS:</strong> {device.osName} {device.osVersion || ""}
            </div>
            <div>
              <strong>Domain:</strong> {device.domain || "Workgroup"}
            </div>
            {device.cpu && (
              <>
                <div>
                  <strong>CPU:</strong> {device.cpu.model}
                </div>
                <div className="text-slate-600 ml-4">
                  {device.cpu.cores} cores / {device.cpu.threads} threads @
                  {device.cpu.clockSpeedMhz} MHz
                </div>
              </>
            )}
            {device.motherboard && (
              <div>
                <strong>Motherboard:</strong> {device.motherboard.manufacturer}{" "}
                {device.motherboard.model}
              </div>
            )}
            {device.ramModules?.length > 0 && (
              <div>
                <strong>RAM:</strong>{" "}
                {device.ramModules.reduce((sum: number, r: any) => sum + r.capacityGb, 0)} GB
              </div>
            )}
          </div>
        </div>

        {/* Disks */}
        {device.disks?.length > 0 && (
          <div className="bg-white p-6 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Storage</h2>
            <div className="space-y-3">
              {device.disks.map((disk: any, i: number) => (
                <div key={i} className="text-sm border-b pb-2">
                  <div className="font-medium">
                    {disk.type} - {disk.totalSpaceGb} GB
                  </div>
                  <div className="text-slate-600">
                    Free: {disk.freeSpaceGb} GB ({((disk.freeSpaceGb / disk.totalSpaceGb) * 100).toFixed(1)}%)
                  </div>
                  {disk.serialNumber && (
                    <div className="text-xs text-slate-500">S/N: {disk.serialNumber}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Software */}
      {device.software?.length > 0 && (
        <div className="bg-white p-6 rounded shadow mt-6">
          <h2 className="text-xl font-semibold mb-4">Installed Software</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Version</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Publisher</th>
                </tr>
              </thead>
              <tbody>
                {device.software.map((sw: any, i: number) => (
                  <tr key={i} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-2">{sw.name}</td>
                    <td className="px-4 py-2">{sw.version}</td>
                    <td className="px-4 py-2">
                      {sw.complianceStatus === "UP_TO_DATE" && (
                        <span className="text-green-600 font-medium">✓ OK</span>
                      )}
                      {sw.complianceStatus === "OUTDATED" && (
                        <span className="text-orange-600 font-medium">⚠ Outdated</span>
                      )}
                      {sw.complianceStatus === "MISSING" && (
                        <span className="text-red-600 font-medium">✗ Missing</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{sw.publisher || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Compliance Alerts */}
      {device.complianceAlerts?.length > 0 && (
        <div className="bg-white p-6 rounded shadow mt-6 border-l-4 border-red-600">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            Compliance Alerts
          </h2>
          <div className="space-y-3">
            {device.complianceAlerts.map((alert: any, i: number) => (
              <div key={i} className="bg-red-50 p-3 rounded text-sm">
                <div className="font-medium text-red-900">{alert.softwareName}</div>
                <div className="text-red-800">{alert.message}</div>
                <div className="text-red-600 text-xs mt-1">
                  {new Date(alert.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
