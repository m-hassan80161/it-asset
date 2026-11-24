import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { WindowsAgent, WindowsAgentRelease, windowsAgentApi } from "../lib/api";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("ar-EG") : "—";
}

export function WindowsAgents() {
  const [agents, setAgents] = useState<WindowsAgent[]>([]);
  const [search, setSearch] = useState("");
  const [latestRelease, setLatestRelease] = useState<WindowsAgentRelease | null>(null);
  const [serverChangeCredential, setServerChangeCredential] = useState("");
  const [serverChangeExpiresAt, setServerChangeExpiresAt] = useState("");
  const [serverChangeAgent, setServerChangeAgent] = useState("");
  const [packageFile, setPackageFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const [agentResult, releaseResult] = await Promise.all([
      windowsAgentApi.list(),
      windowsAgentApi.latestRelease(),
    ]);
    setAgents(agentResult.data);
    setLatestRelease(releaseResult.data);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [agentResult, releaseResult] = await Promise.all([
          windowsAgentApi.list(),
          windowsAgentApi.latestRelease(),
        ]);
        if (!active) return;
        setAgents(agentResult.data);
        setLatestRelease(releaseResult.data);
      } catch {
        if (active) setError("تعذر تحميل بيانات أجهزة الـ Agent.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(() => {
      void refresh().catch(() => setError("تعذر تحديث حالة الأجهزة."));
    }, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [refresh]);

  const toggleAgent = async (agent: WindowsAgent) => {
    setBusy(true);
    setError("");
    try {
      await windowsAgentApi.setEnabled(agent.id, !agent.isEnabled);
      await refresh();
    } catch {
      setError("تعذر تغيير حالة الـ Agent.");
    } finally {
      setBusy(false);
    }
  };

  const createServerChangeCredential = async (agent: WindowsAgent) => {
    setBusy(true);
    setError("");
    setMessage("");
    setServerChangeCredential("");
    try {
      const { data } = await windowsAgentApi.createServerChangeCredential(agent.id);
      setServerChangeCredential(data.credential);
      setServerChangeExpiresAt(data.expiresAt);
      setServerChangeAgent(agent.computerName);
    } catch {
      setError("تعذر إنشاء بيانات اعتماد تغيير السيرفر.");
    } finally {
      setBusy(false);
    }
  };

  const publishRelease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!packageFile || !signatureFile) {
      setError("اختر ملف MSI وملف التوقيع المنفصل.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data } = await windowsAgentApi.publishRelease({
        packageFile,
        signatureFile,
        version,
        notes,
      });
      setLatestRelease(data);
      setPackageFile(null);
      setSignatureFile(null);
      setVersion("");
      setNotes("");
      form.reset();
      setMessage(`تم نشر الإصدار ${data.version} بعد التحقق من توقيعه.`);
    } catch {
      setError("تعذر نشر الإصدار. تحقق من التوقيع وإعداد مفتاح النشر.");
    } finally {
      setBusy(false);
    }
  };

  const onlineCount = agents.filter((agent) => agent.online).length;
  const disabledCount = agents.filter((agent) => !agent.isEnabled).length;
  const filteredAgents = agents.filter((agent) => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return true;
    return [
      agent.computerName,
      agent.primaryMac ?? "",
      ...agent.macAddresses,
      agent.loggedInUser ?? "",
      agent.domain ?? "",
    ].some((value) => value.toLocaleLowerCase().includes(query));
  });

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/devices" className="text-sm text-blue-700 hover:underline">العودة إلى جرد الأجهزة</Link>
          <h1 className="mt-3 text-3xl font-bold">إدارة Windows Agent</h1>
          <p className="mt-2 text-slate-600">النسخة الجديدة تعمل في سجل منفصل ولا تغيّر تسجيل PowerShell الحالي.</p>
        </div>
      </header>

      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}
      {message && <p role="status" className="rounded bg-green-100 p-3 text-green-800">{message}</p>}
      {serverChangeCredential && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold">بيانات اعتماد لمرة واحدة: {serverChangeAgent}</h2>
          <code className="mt-2 block break-all rounded bg-white p-3 text-sm" dir="ltr">
            {serverChangeCredential}
          </code>
          <p className="mt-2 text-sm">
            تنتهي {formatDate(serverChangeExpiresAt)} وتعمل لهذا الجهاز فقط. استخدمها مرة واحدة من PowerShell على الجهاز المستهدف.
          </p>
        </section>
      )}
      <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        التسجيل تلقائي بعد التثبيت والاتصال بعنوان HTTPS. لا يحتاج الجهاز رمز نشر؛
        كل تثبيت يحصل على سر مستقل ولا يستطيع استخدامه للوصول إلى بيانات الأجهزة الأخرى.
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard title="الأجهزة المسجلة" value={agents.length} />
        <SummaryCard title="متصل الآن" value={onlineCount} />
        <SummaryCard title="معطّل من الإدارة" value={disabledCount} />
      </div>

      <section className="rounded-lg bg-white p-5 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">الأجهزة</h2>
          <span className="text-sm text-slate-500">يُعد الجهاز متصلًا إذا أرسل heartbeat خلال آخر 5 دقائق.</span>
        </div>
        <label className="mt-3 block text-sm font-medium">
          بحث باسم الجهاز أو MAC
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={200}
            className="mt-1 w-full rounded border px-3 py-2"
            placeholder="اكتب عنوان MAC أو اسم الجهاز"
          />
        </label>
        {loading ? <p className="mt-4">جارٍ تحميل الأجهزة...</p> : agents.length === 0 ? (
          <p className="mt-4 text-slate-600">لا توجد أجهزة مسجلة بالـ Agent الجديد بعد.</p>
        ) : filteredAgents.length === 0 ? (
          <p className="mt-4 text-slate-600">لا توجد أجهزة مطابقة للبحث.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">اسم الجهاز</th>
                  <th className="p-3">MAC الأساسي</th>
                  <th className="p-3">عناوين MAC</th>
                  <th className="p-3">النظام</th>
                  <th className="p-3">المستخدم / الدومين</th>
                  <th className="p-3">إصدار Agent</th>
                  <th className="p-3">آخر اتصال</th>
                  <th className="p-3">الإدارة</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredAgents.map((agent) => (
                  <tr key={agent.id} className="align-top hover:bg-slate-50">
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${agent.online ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"}`}>
                        {agent.online ? "متصل" : "غير متصل"}
                      </span>
                    </td>
                    <td className="p-3 font-medium">{agent.computerName}</td>
                    <td className="p-3 font-mono" dir="ltr">{agent.primaryMac ?? "—"}</td>
                    <td className="p-3 font-mono" dir="ltr">{agent.macAddresses.join(", ") || "—"}</td>
                    <td className="p-3">{[agent.osName, agent.osVersion].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="p-3">{[agent.loggedInUser, agent.domain].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="p-3" dir="ltr">{agent.agentVersion}</td>
                    <td className="p-3">{formatDate(agent.lastSeenAt)}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void toggleAgent(agent)}
                        className="rounded border px-3 py-1.5 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                      >
                        {agent.isEnabled ? "تعطيل" : "تفعيل"}
                      </button>
                      <button
                        type="button"
                        disabled={busy || !agent.isEnabled}
                        onClick={() => void createServerChangeCredential(agent)}
                        className="mt-2 rounded border px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        كود تغيير السيرفر
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg bg-white p-5 shadow">
        <h2 className="text-xl font-semibold">تحديث Agent من الويب كونسول</h2>
        <p className="mt-2 text-sm text-slate-600">
          الإصدار المنشور يُعرض للأجهزة في فحصها الدوري. لن يُثبّت العميل MSI إلا بعد التحقق من توقيع RSA بالمفتاح العام المضمّن معه.
        </p>
        <p className="mt-2 text-sm">الإصدار الحالي: <strong dir="ltr">{latestRelease?.version ?? "لا يوجد إصدار منشور"}</strong></p>
        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(event) => void publishRelease(event)}>
          <label className="text-sm font-medium">
            رقم الإصدار
            <input required value={version} onChange={(event) => setVersion(event.target.value)} pattern="\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?" placeholder="1.0.0" className="mt-1 w-full rounded border px-3 py-2" dir="ltr" />
          </label>
          <label className="text-sm font-medium">
            ملف MSI
            <input required type="file" accept=".msi,application/x-msi" onChange={(event) => setPackageFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full rounded border p-2" />
          </label>
          <label className="text-sm font-medium">
            التوقيع المنفصل (.sig)
            <input required type="file" accept=".sig,.txt,text/plain" onChange={(event) => setSignatureFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full rounded border p-2" />
          </label>
          <label className="text-sm font-medium">
            ملاحظات الإصدار
            <input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <button type="submit" disabled={busy} className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-50 md:col-span-2">
            التحقق من التوقيع ونشر الإصدار
          </button>
        </form>
      </section>
    </section>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <article className="rounded-lg bg-white p-5 shadow">
      <h2 className="text-sm text-slate-600">{title}</h2>
      <p className="mt-2 text-3xl font-bold">{value.toLocaleString("ar-EG")}</p>
    </article>
  );
}
