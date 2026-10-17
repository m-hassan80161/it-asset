import { useCallback, useEffect, useState } from "react";
import { LogAnalytics, LogEntry, LogFilters, logsApi } from "../lib/logsApi";

const emptyAnalytics: LogAnalytics = {
  errors24h: 0,
  requestCount24h: 0,
  errorRate24h: 0,
  averageApiResponseTime: null,
  databasePerformance: {
    slowOperations: 0,
    errors24h: 0,
    averageOperationTime: null,
  },
  sampleSize: 0,
  slowEndpoints: [],
  errorRateByEndpoint: [],
  responseTimeTrend: [],
};

function csvCell(value: string | number | null) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportLogs(logs: LogEntry[]) {
  const rows = [
    ["Timestamp", "Level", "Source", "User", "Endpoint", "Status", "Response ms", "Message", "Stack trace"],
    ...logs.map((log) => [
      log.timestamp,
      log.level,
      log.source,
      log.userId,
      log.endpoint,
      log.statusCode,
      log.responseTime,
      log.message,
      log.stackTrace,
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "system-logs.csv";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SystemLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [analytics, setAnalytics] = useState(emptyAnalytics);
  const [level, setLevel] = useState<LogFilters["level"] | "">("");
  const [source, setSource] = useState<LogFilters["source"] | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError("");
    const filters: LogFilters = {
      ...(level ? { level } : {}),
      ...(source ? { source } : {}),
      ...(from ? { from: new Date(from).toISOString() } : {}),
      ...(to ? { to: new Date(to).toISOString() } : {}),
      ...(userId.trim() ? { userId: userId.trim() } : {}),
      ...(endpoint.trim() ? { endpoint: endpoint.trim() } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      skip,
      take: 100,
    };
    try {
      const [logsResponse, analyticsResponse] = await Promise.all([
        logsApi.list(filters),
        logsApi.analytics(),
      ]);
      setLogs(logsResponse.data.data);
      setTotal(logsResponse.data.total);
      setAnalytics(analyticsResponse.data);
      setLastUpdated(new Date());
    } catch {
      setError("تعذر تحميل السجلات أو مؤشرات الأداء.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, from, level, search, skip, source, to, userId]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const maxTrend = Math.max(1, ...analytics.responseTimeTrend.map((item) => item.averageResponseTime ?? 0));
  const chartWidth = 640;
  const chartHeight = 150;
  const points = analytics.responseTimeTrend.map((item, index) => {
    const x = analytics.responseTimeTrend.length <= 1
      ? chartWidth / 2
      : (index / (analytics.responseTimeTrend.length - 1)) * chartWidth;
    const y = chartHeight - ((item.averageResponseTime ?? 0) / maxTrend) * chartHeight;
    return `${x},${y}`;
  }).join(" ");

  const exportAllFiltered = async () => {
    setError("");
    try {
      const exported: LogEntry[] = [];
      for (let pageSkip = 0; pageSkip < total; pageSkip += 100) {
        const { data } = await logsApi.list({
          ...(level ? { level } : {}),
          ...(source ? { source } : {}),
          ...(from ? { from: new Date(from).toISOString() } : {}),
          ...(to ? { to: new Date(to).toISOString() } : {}),
          ...(userId.trim() ? { userId: userId.trim() } : {}),
          ...(endpoint.trim() ? { endpoint: endpoint.trim() } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
          skip: pageSkip,
          take: 100,
        });
        exported.push(...data.data);
      }
      exportLogs(exported);
    } catch {
      setError("تعذر تصدير كل السجلات المطابقة.");
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">سجلات النظام والأداء</h1>
          <p className="mt-2 text-slate-600">
            تحديث تلقائي كل 10 ثوانٍ{lastUpdated ? ` · آخر تحديث ${lastUpdated.toLocaleTimeString()}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="rounded border px-4 py-2">تحديث الآن</button>
          <button onClick={() => void exportAllFiltered()} disabled={!total} className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50">تصدير CSV</button>
        </div>
      </header>
      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["أخطاء آخر 24 ساعة", analytics.errors24h],
          ["الطلبات آخر 24 ساعة", analytics.requestCount24h],
          ["معدل الأخطاء", `${analytics.errorRate24h}%`],
          ["متوسط استجابة API", analytics.averageApiResponseTime === null ? "—" : `${analytics.averageApiResponseTime} ms`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white p-5 shadow">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-blue-800">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg bg-white p-5 shadow">
          <h2 className="mb-3 text-lg font-semibold">صحة قاعدة البيانات</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <p>أخطاء آخر 24 ساعة: <b>{analytics.databasePerformance.errors24h}</b></p>
            <p>عمليات بطيئة (&gt;1s): <b>{analytics.databasePerformance.slowOperations}</b></p>
            <p>متوسط العملية: <b>{analytics.databasePerformance.averageOperationTime === null ? "—" : `${analytics.databasePerformance.averageOperationTime} ms`}</b></p>
          </div>
          <p className="mt-2 text-xs text-slate-500">تُسجّل عمليات Prisma البطيئة والفاشلة دون حفظ نص الاستعلام أو بياناته.</p>
        </section>
        <section className="rounded-lg bg-white p-5 shadow">
          <h2 className="mb-3 text-lg font-semibold">اتجاه متوسط زمن الاستجابة (24 ساعة)</h2>
          {analytics.responseTimeTrend.length ? (
            <>
              <svg role="img" aria-label="مخطط متوسط زمن استجابة API خلال آخر 24 ساعة" viewBox={`0 0 ${chartWidth} ${chartHeight + 30}`} className="h-48 w-full">
                <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="#cbd5e1" />
                <polyline points={points} fill="none" stroke="#1d4ed8" strokeWidth="3" />
                {analytics.responseTimeTrend.map((item, index) => {
                  const x = analytics.responseTimeTrend.length <= 1 ? chartWidth / 2 : (index / (analytics.responseTimeTrend.length - 1)) * chartWidth;
                  return <text key={item.timestamp} x={x} y={chartHeight + 22} textAnchor="middle" fontSize="11" fill="#64748b">{new Date(item.timestamp).getHours()}:00</text>;
                })}
              </svg>
              <p className="text-xs text-slate-500">متوسط أزمنة العينة المتاحة: {analytics.sampleSize} سجل</p>
            </>
          ) : <p className="text-slate-500">لا توجد قياسات استجابة خلال الفترة.</p>}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="overflow-x-auto rounded-lg bg-white p-5 shadow">
          <h2 className="mb-3 text-lg font-semibold">نقاط API البطيئة (&gt;1000ms)</h2>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100"><tr><th className="p-2">Endpoint</th><th className="p-2">المتوسط</th><th className="p-2">الطلبات</th></tr></thead>
            <tbody className="divide-y">
              {analytics.slowEndpoints.map((item) => <tr key={item.endpoint}><td className="p-2 font-mono">{item.endpoint}</td><td className="p-2">{item.averageResponseTime} ms</td><td className="p-2">{item.requestCount}</td></tr>)}
              {!analytics.slowEndpoints.length && <tr><td colSpan={3} className="p-3 text-slate-500">لا توجد نقاط بطيئة في العينة.</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="overflow-x-auto rounded-lg bg-white p-5 shadow">
          <h2 className="mb-3 text-lg font-semibold">معدل الأخطاء حسب Endpoint</h2>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100"><tr><th className="p-2">Endpoint</th><th className="p-2">المعدل</th><th className="p-2">أخطاء/طلبات</th></tr></thead>
            <tbody className="divide-y">
              {analytics.errorRateByEndpoint.slice(0, 15).map((item) => <tr key={item.endpoint}><td className="p-2 font-mono">{item.endpoint}</td><td className="p-2">{item.errorRate}%</td><td className="p-2">{item.errorCount}/{item.requestCount}</td></tr>)}
              {!analytics.errorRateByEndpoint.length && <tr><td colSpan={3} className="p-3 text-slate-500">لا توجد بيانات.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      <section className="space-y-3 rounded-lg bg-white p-5 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">عارض السجلات ({total}) {loading && "(جارٍ التحديث...)"}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select aria-label="مستوى السجل" value={level} onChange={(event) => { setSkip(0); setLevel(event.target.value as LogFilters["level"] | ""); }} className="rounded border px-3 py-2">
            <option value="">كل المستويات</option>
            {["INFO", "WARNING", "ERROR", "DEBUG"].map((item) => <option key={item}>{item}</option>)}
          </select>
          <select aria-label="مصدر السجل" value={source} onChange={(event) => { setSkip(0); setSource(event.target.value as LogFilters["source"] | ""); }} className="rounded border px-3 py-2">
            <option value="">كل المصادر</option>
            {["FRONTEND", "BACKEND", "DATABASE", "API"].map((item) => <option key={item}>{item}</option>)}
          </select>
          <label className="text-xs text-slate-500">من
            <input type="datetime-local" value={from} onChange={(event) => { setSkip(0); setFrom(event.target.value); }} className="mt-1 block w-full rounded border px-3 py-2 text-sm text-slate-900" />
          </label>
          <label className="text-xs text-slate-500">إلى
            <input type="datetime-local" value={to} onChange={(event) => { setSkip(0); setTo(event.target.value); }} className="mt-1 block w-full rounded border px-3 py-2 text-sm text-slate-900" />
          </label>
          <input aria-label="معرف المستخدم" value={userId} onChange={(event) => { setSkip(0); setUserId(event.target.value); }} placeholder="User ID" className="rounded border px-3 py-2" />
          <input aria-label="Endpoint" value={endpoint} onChange={(event) => { setSkip(0); setEndpoint(event.target.value); }} placeholder="Endpoint" className="rounded border px-3 py-2" />
          <input aria-label="بحث في الرسائل" value={search} onChange={(event) => { setSkip(0); setSearch(event.target.value); }} placeholder="بحث في الرسائل أو Endpoint" className="rounded border px-3 py-2 sm:col-span-2" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600"><tr><th className="p-3">الوقت</th><th className="p-3">المستوى</th><th className="p-3">المصدر</th><th className="p-3">المستخدم</th><th className="p-3">Endpoint</th><th className="p-3">الحالة</th><th className="p-3">الزمن</th><th className="p-3">الرسالة</th></tr></thead>
            <tbody className="divide-y">
              {logs.map((log) => (
                <tr key={log.id} className={log.level === "ERROR" ? "bg-red-50" : ""}>
                  <td className="whitespace-nowrap p-3">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="p-3">{log.level}</td>
                  <td className="p-3">{log.source}</td>
                  <td className="max-w-28 truncate p-3" title={log.userId ?? ""}>{log.userId ?? "—"}</td>
                  <td className="p-3 font-mono">{log.endpoint ?? "—"}</td>
                  <td className="p-3">{log.statusCode ?? "—"}</td>
                  <td className="p-3">{log.responseTime === null ? "—" : `${log.responseTime} ms`}</td>
                  <td className="max-w-sm p-3">
                    {log.message}
                    {log.stackTrace && <details className="mt-1"><summary className="cursor-pointer text-blue-700">Stack trace</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{log.stackTrace}</pre></details>}
                  </td>
                </tr>
              ))}
              {!logs.length && <tr><td colSpan={8} className="p-6 text-center text-slate-500">لا توجد سجلات تطابق عوامل التصفية.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button disabled={!skip} onClick={() => setSkip(Math.max(0, skip - 100))} className="rounded border px-3 py-1 disabled:opacity-50">السابق</button>
          <button disabled={skip + logs.length >= total} onClick={() => setSkip(skip + 100)} className="rounded border px-3 py-1 disabled:opacity-50">التالي</button>
        </div>
      </section>
    </section>
  );
}
