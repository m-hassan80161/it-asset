import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrackedAsset, assetsApi } from "../lib/api";
import { BarcodeCameraScanner } from "../components/BarcodeCameraScanner";

function formatDate(value: string) {
  return new Date(value).toLocaleString("ar-EG");
}

export function AssetMaintenance() {
  const [assets, setAssets] = useState<TrackedAsset[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      assetsApi.maintenanceTimeline(search)
        .then(({ data }) => {
          if (active) setAssets(data);
        })
        .catch(() => {
          if (active) setError("تعذر تحميل سجل الصيانات والتحركات.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  return (
    <section className="space-y-6">
      <header>
        <Link to="/assets" className="text-sm text-blue-700 hover:underline">العودة إلى سجل الأصول</Link>
        <h1 className="mt-3 text-3xl font-bold">الصيانات وتحركات الأجهزة</h1>
        <p className="mt-2 text-slate-600">ابحث برقم الباركود أو الرقم التسلسلي أو الموديل لعرض تاريخ الجهاز.</p>
      </header>

      <div className="rounded-lg bg-white p-4 shadow">
        <label className="block text-sm font-medium">
          بحث عن جهاز
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={200}
            className="mt-1 w-full rounded border px-3 py-2"
            placeholder="امسح الباركود أو اكتب الرقم التسلسلي أو الموديل"
          />
        </label>
        <div className="mt-2"><BarcodeCameraScanner onDetected={setSearch} /></div>
      </div>

      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}
      {loading ? <p>جارٍ تحميل السجل...</p> : assets.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-slate-600 shadow">لا توجد أجهزة مطابقة للبحث.</p>
      ) : (
        <div className="space-y-4">
          {assets.map((asset) => (
            <article key={asset.id} className="rounded-lg bg-white p-5 shadow">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link to={`/assets/${asset.id}`} className="font-mono text-lg font-semibold text-blue-700 hover:underline" dir="ltr">{asset.assetCode}</Link>
                  <h2 className="mt-1 text-xl font-semibold">{asset.modelName}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    الفرع: {asset.branch ?? asset.location}
                    {asset.department ? ` · الإدارة: ${asset.department}` : ""}
                    {asset.employee ? ` · الموظف: ${asset.employee.name}${asset.employee.email ? ` (${asset.employee.email})` : ""}` : ""}
                  </p>
                </div>
                <Link to={`/assets/${asset.id}`} className="rounded border border-blue-700 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50">عرض تفاصيل الجهاز</Link>
              </header>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                <section>
                  <h3 className="mb-2 font-semibold">آخر صيانتين</h3>
                  {!asset.maintenance?.length ? <p className="text-sm text-slate-500">لا توجد صيانات مسجلة.</p> : (
                    <ul className="space-y-2">
                      {asset.maintenance.slice(0, 2).map((record) => (
                        <li key={record.id} className="border-r-2 border-emerald-200 pr-3 text-sm">
                          <p className="font-medium">{record.summary}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatDate(record.maintenanceDate)} · {record.createdByName}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section>
                  <h3 className="mb-2 font-semibold">آخر حركتين</h3>
                  {!asset.locationHistory?.length ? <p className="text-sm text-slate-500">لا توجد تحركات مسجلة.</p> : (
                    <ul className="space-y-2">
                      {asset.locationHistory.slice(0, 2).map((change) => (
                        <li key={change.id} className="border-r-2 border-blue-200 pr-3 text-sm">
                          <p>{change.fromLocation ? `من ${change.fromLocation} إلى ${change.toLocation}` : `تم تسجيل الجهاز في ${change.toLocation}`}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatDate(change.changedAt)} · {change.changedByName}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
              <p className="mt-3 text-xs text-slate-500">يتم عرض أحدث حركتين وأحدث صيانتين فقط هنا؛ باقي السجل في تفاصيل الجهاز.</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
