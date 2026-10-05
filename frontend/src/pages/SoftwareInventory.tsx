import { useEffect, useMemo, useState } from "react";
import { inventoryApi } from "../lib/api";
import { ChevronLeft, ChevronRight, Package, Search } from "lucide-react";

interface InstalledSoftware {
  id: string;
  name: string;
  version: string;
  publisher?: string | null;
  installDate?: string | null;
}

interface Device {
  id: string;
  computerName: string;
  software?: InstalledSoftware[];
  installedSoftware?: InstalledSoftware[];
}

interface SoftwareRow extends InstalledSoftware {
  deviceName: string;
}

const DEVICES_PER_REQUEST = 100;
const ROWS_PER_PAGE = 20;

export function SoftwareInventory() {
  const [software, setSoftware] = useState<SoftwareRow[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadSoftware = async () => {
      try {
        setLoading(true);
        setError("");
        const rows: SoftwareRow[] = [];
        let skip = 0;
        let devices: Device[];

        do {
          const response = await inventoryApi.list(skip, DEVICES_PER_REQUEST);
          devices = response.data;
          for (const device of devices) {
            for (const item of device.installedSoftware ?? device.software ?? []) {
              rows.push({ ...item, deviceName: device.computerName });
            }
          }
          skip += devices.length;
        } while (devices.length === DEVICES_PER_REQUEST);

        if (active) setSoftware(rows);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load software inventory");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadSoftware();
    return () => {
      active = false;
    };
  }, []);

  const filteredSoftware = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    if (!normalizedSearch) return software;
    return software.filter((item) =>
      item.name.toLocaleLowerCase().includes(normalizedSearch),
    );
  }, [search, software]);

  const pageCount = Math.ceil(filteredSoftware.length / ROWS_PER_PAGE);
  const pageItems = filteredSoftware.slice(
    page * ROWS_PER_PAGE,
    (page + 1) * ROWS_PER_PAGE,
  );

  const formatInstallDate = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  };

  if (loading) return <div className="p-4">Loading software inventory...</div>;

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Software Inventory</h1>
          <p className="mt-1 text-slate-600">Installed software across managed devices</p>
        </div>
        <label className="relative block sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Search software name"
            className="w-full rounded border border-slate-300 bg-white py-2 pl-9 pr-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </label>
      </div>

      {error && <div className="mb-4 rounded bg-red-100 p-4 text-red-700">{error}</div>}

      <div className="overflow-hidden rounded bg-white shadow">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-slate-100">
              <tr>
                <th className="px-6 py-3 text-left">Software Name</th>
                <th className="px-6 py-3 text-left">Version</th>
                <th className="px-6 py-3 text-left">Publisher</th>
                <th className="px-6 py-3 text-left">Install Date</th>
                <th className="px-6 py-3 text-left">Device Name</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((item) => (
                <tr key={item.id} className="border-b transition hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium">{item.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{item.version}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{item.publisher || "—"}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {formatInstallDate(item.installDate)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-700">{item.deviceName}</td>
                </tr>
              ))}
              {!pageItems.length && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <Package className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                    {search ? "No matching software found." : "No installed software found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          disabled={page === 0}
          className="inline-flex items-center gap-1 rounded bg-blue-600 px-4 py-2 text-white disabled:bg-slate-300"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>
        <span className="text-sm text-slate-600">
          {filteredSoftware.length
            ? `Showing ${page * ROWS_PER_PAGE + 1}–${Math.min(
                (page + 1) * ROWS_PER_PAGE,
                filteredSoftware.length,
              )} of ${filteredSoftware.length}`
            : "0 items"}
        </span>
        <button
          onClick={() =>
            setPage((current) => Math.min(Math.max(0, pageCount - 1), current + 1))
          }
          disabled={page >= pageCount - 1}
          className="inline-flex items-center gap-1 rounded bg-blue-600 px-4 py-2 text-white disabled:bg-slate-300"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
