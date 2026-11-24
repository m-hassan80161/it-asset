import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AssetType, TrackedAsset, assetsApi } from "../lib/api";
import { BarcodeCameraScanner } from "../components/BarcodeCameraScanner";

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  PRINTER: "طابعة",
  SCANNER: "ماسح ضوئي",
  PC: "كمبيوتر",
  MONITOR: "شاشة",
  OTHER: "أخرى",
};

export function Assets() {
  const [assets, setAssets] = useState<TrackedAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      assetsApi.list(search)
        .then(({ data }) => {
          if (!active) return;
          setAssets(data.data);
          setTotal(data.total);
        })
        .catch(() => {
          if (active) setError("تعذر تحميل سجل الأجهزة.");
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">سجل الأصول والأجهزة</h1>
          <p className="mt-2 text-slate-600">أنشئ رقمًا فريدًا لكل جهاز وتابع مكانه وصيانته.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/assets/maintenance" className="rounded border border-blue-700 px-4 py-2 font-medium text-blue-700 hover:bg-blue-50">سجل الصيانات والتحركات</Link>
          <Link to="/assets/report" className="rounded border border-blue-700 px-4 py-2 font-medium text-blue-700 hover:bg-blue-50">تقرير حالة الأجهزة</Link>
          <Link to="/assets/new" className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800">تسجيل جهاز جديد</Link>
        </div>
      </header>

      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}

      <div className="rounded-lg bg-white p-4 shadow">
        <label className="block text-sm font-medium">
          بحث برقم الجهاز أو السيريال أو الموديل أو المكان
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={200}
            className="mt-1 w-full rounded border px-3 py-2"
            placeholder="مثال: PRN-000001 أو الرقم التسلسلي"
          />
        </label>
        <div className="mt-2"><BarcodeCameraScanner onDetected={setSearch} /></div>
      </div>

      {loading ? <p>جارٍ تحميل الأجهزة...</p> : assets.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-slate-600 shadow">لا توجد أجهزة مطابقة للبحث.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3">ID الجهاز</th>
                <th className="p-3">النوع</th>
                <th className="p-3">الموديل</th>
                <th className="p-3">الفرع / الإدارة / الموظف</th>
                <th className="p-3">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {assets.map((asset) => (
                <tr key={asset.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono font-semibold" dir="ltr">
                    <Link to={`/assets/${asset.id}`} className="text-blue-700 hover:underline">{asset.assetCode}</Link>
                  </td>
                  <td className="p-3">{ASSET_TYPE_LABELS[asset.type]}</td>
                  <td className="p-3">{asset.modelName}</td>
                  <td className="p-3">
                    <div>{asset.branch ?? asset.location}{asset.department ? ` · ${asset.department}` : ""}</div>
                    {asset.employee && <div className="text-xs text-slate-500">{asset.employee.name}{asset.employee.email ? ` · ${asset.employee.email}` : ""}</div>}
                  </td>
                  <td className="p-3"><Link to={`/assets/${asset.id}`} className="rounded border px-3 py-1.5 text-blue-700 hover:bg-blue-50">عرض التفاصيل</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > assets.length && <p className="p-3 text-sm text-slate-500">يتم عرض أول {assets.length} نتيجة من أصل {total}. استخدم البحث لتضييق النتائج.</p>}
        </div>
      )}
    </section>
  );
}
