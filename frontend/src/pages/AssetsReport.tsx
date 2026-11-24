import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AssetReport, AssetType, assetsApi } from "../lib/api";

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  PRINTER: "طابعة",
  SCANNER: "ماسح ضوئي",
  PC: "كمبيوتر",
  MONITOR: "شاشة",
  OTHER: "أخرى",
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("ar-EG") : "—";
}

export function AssetsReport() {
  const [report, setReport] = useState<AssetReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    assetsApi.report()
      .then(({ data }) => {
        if (active) setReport(data);
      })
      .catch(() => {
        if (active) setError("تعذر تحميل تقرير حالة الأجهزة.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) return <p>جارٍ تحميل التقرير...</p>;
  if (error) return <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>;
  if (!report) return null;

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/assets" className="text-sm text-blue-700 hover:underline">العودة إلى سجل الأصول</Link>
          <h1 className="mt-3 text-3xl font-bold">تقرير حالة الأجهزة والصيانة</h1>
          <p className="mt-2 text-slate-600">ملخص شامل لسجلات الأجهزة والصيانة المسجلة منذ بداية استخدام سجل الأصول.</p>
        </div>
        <Link to="/assets/maintenance" className="rounded border border-blue-700 px-4 py-2 font-medium text-blue-700 hover:bg-blue-50">
          سجل الصيانات والتحركات
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReportCard title="إجمالي الأجهزة" value={report.totalAssets} />
        <ReportCard title="أجهزة لها صيانات" value={report.assetsWithMaintenance} />
        <ReportCard title="بدون صيانات مسجلة" value={report.assetsWithoutMaintenance} />
        <ReportCard title="إجمالي سجلات الصيانة" value={report.totalMaintenanceRecords} />
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        الجهاز يظهر في قائمة المراجعة عند تسجيل {report.frequentMaintenanceThreshold} صيانات أو أكثر طوال عمره المسجل.
        هذه توصية بمراجعة تكلفة الأعطال وحالة الجهاز، وليست قرار استبدال تلقائيًا. التقرير يعتمد على ملخصات الصيانة التي يُدخلها المستخدمون.
      </div>

      <section className="rounded-lg bg-white p-5 shadow">
        <h2 className="text-xl font-semibold">الأجهزة كثيرة الصيانة والتوصيات</h2>
        {report.frequentMaintenanceAssets.length === 0 ? (
          <p className="mt-3 text-slate-600">لا توجد أجهزة وصلت إلى حد الصيانة المتكررة حاليًا.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3">الجهاز</th>
                  <th className="p-3">النوع والموديل</th>
                  <th className="p-3">المكان</th>
                  <th className="p-3">عدد الصيانات</th>
                  <th className="p-3">آخر صيانة</th>
                  <th className="p-3">التوصية</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.frequentMaintenanceAssets.map((asset) => (
                  <tr key={asset.id} className="align-top hover:bg-slate-50">
                    <td className="p-3 font-mono" dir="ltr">
                      <Link to={`/assets/${asset.id}`} className="font-semibold text-blue-700 hover:underline">{asset.assetCode}</Link>
                    </td>
                    <td className="p-3">{ASSET_TYPE_LABELS[asset.type]} · {asset.modelName}</td>
                    <td className="p-3">{asset.branch ?? asset.location}</td>
                    <td className="p-3 font-semibold">{asset.maintenanceCount}</td>
                    <td className="p-3">{formatDate(asset.lastMaintenanceDate)}</td>
                    <td className="p-3">
                      {asset.maintenanceCount >= 5
                        ? "مراجعة عاجلة لتكلفة الإصلاح وجدوى الاستبدال."
                        : "مراجعة الحالة وتكلفة الإصلاح قبل الصيانة القادمة."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg bg-white p-5 shadow">
        <h2 className="text-xl font-semibold">أكثر الأعطال أو ملخصات الصيانة تكرارًا</h2>
        <p className="mt-1 text-sm text-slate-600">تُجمع السجلات ذات الملخص المتطابق بعد توحيد حالة الأحرف والمسافات.</p>
        {report.recurringIssues.length === 0 ? (
          <p className="mt-3 text-slate-600">لا توجد ملخصات صيانة مسجلة بعد.</p>
        ) : (
          <ol className="mt-4 divide-y">
            {report.recurringIssues.map((issue, index) => (
              <li key={`${issue.summary}-${index}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <span className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-800">{index + 1}</span>
                  <span className="font-medium">{issue.summary}</span>
                  <p className="mr-9 mt-1 text-xs text-slate-500">ظهر في {issue.assetCount} جهاز</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">{issue.count} مرة</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}

function ReportCard({ title, value }: { title: string; value: number }) {
  return (
    <article className="rounded-lg bg-white p-5 shadow">
      <h2 className="text-sm text-slate-600">{title}</h2>
      <p className="mt-2 text-3xl font-bold">{value.toLocaleString("ar-EG")}</p>
    </article>
  );
}
