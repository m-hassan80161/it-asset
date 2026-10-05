import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { inventoryApi } from "../lib/api";
import { ChevronRight, Search, Trash2 } from "lucide-react";

interface Device {
  id: string;
  computerName: string;
  loggedInUser?: string;
  osName?: string;
  osVersion?: string;
  lastSeenAt: string;
  software?: Array<{ id: string; name: string; version: string }>;
  installedSoftware?: Array<{ id: string; name: string; version: string }>;
}

export function DeviceList() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [skip, setSkip] = useState(0);
  const [softwareName, setSoftwareName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const take = 20;
  const normalizedSoftwareName = softwareName.trim().toLocaleLowerCase();

  useEffect(() => {
    let active = true;

    const loadDevices = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await inventoryApi.list(skip, take, softwareName);
        if (active) setDevices(res.data);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load devices");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDevices();
    return () => {
      active = false;
    };
  }, [skip, softwareName]);

  const deleteDevice = async (device: Device) => {
    if (!window.confirm(`Delete device "${device.computerName}" and its inventory?`)) {
      return;
    }

    try {
      setDeletingId(device.id);
      setError("");
      await inventoryApi.remove(device.id);
      const remainingDevices = devices.filter((item) => item.id !== device.id);
      setDevices(remainingDevices);
      if (remainingDevices.length === 0 && skip > 0) {
        setSkip(Math.max(0, skip - take));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete device");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Managed Devices</h1>

      {error && <div className="bg-red-100 text-red-700 p-4 rounded mb-4">{error}</div>}

      <label className="relative mb-4 block max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={softwareName}
          onChange={(event) => {
            setSoftwareName(event.target.value);
            setSkip(0);
          }}
          placeholder="Find devices with software..."
          className="w-full rounded border border-slate-300 bg-white py-2 pl-9 pr-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
      </label>

      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100 border-b">
            <tr>
              <th className="text-left px-6 py-3">Computer Name</th>
              <th className="text-left px-6 py-3">User</th>
              <th className="text-left px-6 py-3">OS</th>
              <th className="text-left px-6 py-3">Software / Version</th>
              <th className="text-left px-6 py-3">Last Seen</th>
              <th className="text-center px-6 py-3">Actions</th>
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
                <td className="px-6 py-4 text-sm">
                  {normalizedSoftwareName
                    ? (device.installedSoftware ?? device.software ?? [])
                        .filter((item) =>
                          item.name.toLocaleLowerCase().includes(normalizedSoftwareName),
                        )
                        .map((item) => (
                          <div key={item.id} className="whitespace-nowrap">
                            <span className="font-medium">{item.name}</span>
                            <span className="ml-2 text-slate-600">{item.version}</span>
                          </div>
                        ))
                    : <span className="text-slate-400">Search for a program to compare versions</span>}
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">
                  {new Date(device.lastSeenAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="inline-flex items-center gap-3">
                    <button
                      onClick={() => navigate(`/devices/${device.id}`)}
                      className="text-blue-600 hover:text-blue-900 inline-flex items-center gap-1"
                    >
                      View
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteDevice(device)}
                      disabled={deletingId === device.id}
                      className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                      aria-label={`Delete ${device.computerName}`}
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingId === device.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {loading && devices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                  Loading devices...
                </td>
              </tr>
            )}
            {!loading && devices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                  {softwareName
                    ? `No devices found with software matching "${softwareName}".`
                    : "No devices found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-6 flex gap-2 justify-center">
        <button
          onClick={() => setSkip(Math.max(0, skip - take))}
          disabled={skip === 0 || loading}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-slate-300"
        >
          Previous
        </button>
        <span className="px-4 py-2 text-slate-600">
          {loading && devices.length === 0
            ? "Loading..."
            : devices.length
              ? `Showing ${skip + 1} to ${skip + devices.length}`
              : "0 devices"}
        </span>
        <button
          onClick={() => setSkip(skip + take)}
          disabled={loading || devices.length < take}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-slate-300"
        >
          Next
        </button>
      </div>
    </div>
  );
}