import { FormEvent, useEffect, useState } from "react";
import { BranchPattern, inventoryApi } from "../lib/api";

export function BranchPatternSettings() {
  const [rules, setRules] = useState<BranchPattern[]>([]);
  const [branches, setBranches] = useState<Array<{ name: string }>>([]);
  const [newBranch, setNewBranch] = useState("");
  const [source, setSource] = useState<BranchPattern["source"]>("DOMAIN");
  const [pattern, setPattern] = useState("");
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadRules = async () => {
    setError("");
    try {
      const [ruleResponse, branchResponse] = await Promise.all([
        inventoryApi.branchPatterns(),
        inventoryApi.branches(),
      ]);
      setRules(ruleResponse.data);
      setBranches(branchResponse.data);
    } catch {
      setError("تعذر تحميل قواعد توزيع الفروع.");
    } finally {
      setLoading(false);
    }
  };

  const saveBranch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await inventoryApi.createBranch(newBranch.trim());
      setNewBranch("");
      setNotice("تمت إضافة الفرع، وأصبح متاحًا للتعيين وإنشاء القواعد.");
      await loadRules();
    } catch {
      setError("تعذر إضافة الفرع. تأكد أن الاسم غير مستخدم.");
    } finally {
      setSaving(false);
    }
  };

  const deleteBranch = async (name: string) => {
    if (!window.confirm(`حذف الفرع "${name}"؟`)) return;
    setError("");
    try {
      await inventoryApi.deleteBranch(name);
      setNotice("تم حذف الفرع.");
      await loadRules();
    } catch {
      setError("لا يمكن حذف الفرع طالما كان مستخدمًا في حساب أو قاعدة أو تيكت.");
    }
  };

  useEffect(() => {
    void loadRules();
  }, []);

  const saveRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await inventoryApi.createBranchPattern({ source, pattern: pattern.trim(), branch: branch.trim() });
      setPattern("");
      setBranch("");
      setNotice("تمت إضافة القاعدة. تطبق القواعد الأطول أولًا.");
      await loadRules();
    } catch {
      setError("تعذر إضافة القاعدة. تأكد من أن النمط فريد لهذا النوع.");
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (rule: BranchPattern) => {
    if (!window.confirm(`حذف قاعدة "${rule.pattern}" للفرع ${rule.branch}؟`)) return;
    setError("");
    try {
      await inventoryApi.deleteBranchPattern(rule.id);
      setNotice("تم حذف القاعدة.");
      await loadRules();
    } catch {
      setError("تعذر حذف القاعدة.");
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">قواعد ربط الأجهزة بالفروع</h1>
        <p className="mt-2 text-slate-600">
          تتم مطابقة النص داخل الدومين عندما يكون مسجلًا؛ عند عدم وجود دومين تتم المطابقة داخل اسم الجهاز. إذا تطابقت عدة قواعد، يختار النظام النمط الأطول.
        </p>
      </header>
      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded bg-green-100 p-3 text-green-800">{notice}</p>}
      <section className="space-y-4 rounded-lg bg-white p-6 shadow">
        <h2 className="text-xl font-semibold">الفروع</h2>
        <form onSubmit={saveBranch} className="flex flex-wrap gap-3">
          <input
            required
            minLength={1}
            maxLength={120}
            value={newBranch}
            onChange={(event) => setNewBranch(event.target.value)}
            className="min-w-64 flex-1 rounded border px-3 py-2"
            placeholder="اسم الفرع"
          />
          <button disabled={saving} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">
            إضافة فرع
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          {branches.map(({ name }) => (
            <span key={name} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm">
              {name}
              <button type="button" onClick={() => void deleteBranch(name)} aria-label={`حذف فرع ${name}`} className="text-red-700">×</button>
            </span>
          ))}
          {!branches.length && <p className="text-sm text-slate-500">أضف الفروع أولًا لتعيينها للحسابات وقواعد الأجهزة.</p>}
        </div>
      </section>
      <form onSubmit={saveRule} className="grid gap-4 rounded-lg bg-white p-6 shadow md:grid-cols-3">
        <label className="text-sm font-medium">مصدر المطابقة
          <select value={source} onChange={(event) => setSource(event.target.value as BranchPattern["source"])} className="mt-1 w-full rounded border px-3 py-2">
            <option value="DOMAIN">الدومين</option>
            <option value="COMPUTER_NAME">اسم الجهاز (عند غياب الدومين)</option>
          </select>
        </label>
        <label className="text-sm font-medium">النمط (نص يحتويه الاسم)
          <input required minLength={1} maxLength={120} value={pattern} onChange={(event) => setPattern(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" placeholder={source === "DOMAIN" ? "cairo.company.local" : "CAI-"} />
        </label>
        <label className="text-sm font-medium">الفرع
          <select required value={branch} onChange={(event) => setBranch(event.target.value)} className="mt-1 w-full rounded border px-3 py-2">
            <option value="">اختر الفرع</option>
            {branches.map(({ name }) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <button disabled={saving} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50 md:col-span-3">
          {saving ? "جارٍ الحفظ..." : "إضافة قاعدة"}
        </button>
      </form>
      <section className="overflow-x-auto rounded-lg bg-white shadow">
        <h2 className="p-5 text-xl font-semibold">القواعد ({rules.length})</h2>
        {loading ? <p className="p-5">جارٍ تحميل القواعد...</p> : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100"><tr><th className="p-3">الأولوية</th><th className="p-3">المصدر</th><th className="p-3">النمط</th><th className="p-3">الفرع</th><th className="p-3">إجراء</th></tr></thead>
            <tbody className="divide-y">
              {[...rules].sort((a, b) => b.pattern.length - a.pattern.length).map((rule, index) => (
                <tr key={rule.id}>
                  <td className="p-3">{index + 1}</td>
                  <td className="p-3">{rule.source === "DOMAIN" ? "الدومين" : "اسم الجهاز"}</td>
                  <td className="p-3 font-mono">{rule.pattern}</td>
                  <td className="p-3">{rule.branch}</td>
                  <td className="p-3"><button onClick={() => void deleteRule(rule)} className="rounded border border-red-300 px-3 py-1 text-red-700">حذف</button></td>
                </tr>
              ))}
              {!rules.length && <tr><td colSpan={5} className="p-5 text-center text-slate-500">لم تُضف قواعد بعد.</td></tr>}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
