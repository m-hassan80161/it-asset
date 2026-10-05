import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { inventoryApi } from "../lib/api";
import { ArrowLeft, Search } from "lucide-react";

export function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [device, setDevice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [softwareSearch, setSoftwareSearch] = useState("");

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

  const installedSoftware = device.installedSoftware ?? device.software ?? [];
  const filteredSoftware = installedSoftware.filter((sw: any) =>
    sw.name.toLocaleLowerCase().includes(softwareSearch.trim().toLocaleLowerCase()),
  );

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
      <div className="bg-white p-6 rounded shadow mt-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold mb-4">Installed Software</h2>
          <label className="relative block sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={softwareSearch}
              onChange={(event) => setSoftwareSearch(event.target.value)}
              placeholder="Search this device's software..."
              className="w-full rounded border border-slate-300 bg-white py-2 pl-9 pr-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>
        </div>
        {installedSoftware.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Version</th>
                  <th className="text-left px-4 py-2">Publisher</th>
                </tr>
              </thead>
              <tbody>
                {filteredSoftware.map((sw: any, i: number) => (
                  <tr key={i} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-2">{sw.name}</td>
                    <td className="px-4 py-2">{sw.version}</td>
                    <td className="px-4 py-2 text-slate-600">{sw.publisher || "—"}</td>
                  </tr>
                ))}
                {filteredSoftware.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                      No matching software found on this device.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-slate-500">No software is recorded for this device.</p>
        )}
      </div>
    </div>
  );
}
