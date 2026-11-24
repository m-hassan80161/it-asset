import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AssetEmployee, AssetType, assetsApi } from "../lib/api";

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  PRINTER: "طابعة — PRN",
  SCANNER: "ماسح ضوئي — SCN",
  PC: "كمبيوتر — PC",
  MONITOR: "شاشة — MON",
  OTHER: "أخرى — OTH",
};

export function AssetCreate() {
  const navigate = useNavigate();
  const [type, setType] = useState<AssetType>("PRINTER");
  const [modelName, setModelName] = useState("");
  const [branches, setBranches] = useState<Array<{ name: string }>>([]);
  const [employees, setEmployees] = useState<AssetEmployee[]>([]);
  const [branch, setBranch] = useState("");
  const [department, setDepartment] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [isNewEmployee, setIsNewEmployee] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    assetsApi.options()
      .then(({ data }) => {
        setBranches(data.branches);
        setEmployees(data.employees);
        setBranch(data.branches[0]?.name ?? "");
      })
      .catch(() => setError("تعذر تحميل الفروع والموظفين المسجلين."))
      .finally(() => setOptionsLoading(false));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { data } = await assetsApi.create({
        type,
        modelName: modelName.trim(),
        branch,
        ...(department.trim() ? { department: department.trim() } : {}),
        ...(employeeId
          ? { employeeId }
          : employeeName.trim() || employeeEmail.trim()
            ? { employeeName: employeeName.trim(), employeeEmail: employeeEmail.trim() }
            : {}),
      });
      navigate(`/assets/${data.id}`, { state: { notice: "تم تسجيل الجهاز وإنشاء رقم وباركود فريد له. اطبع الملصق وثبته على الجهاز." } });
    } catch {
      setError("تعذر تسجيل الجهاز. راجع البيانات وحاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header>
        <Link to="/assets" className="text-sm text-blue-700 hover:underline">العودة إلى سجل الأصول</Link>
        <h1 className="mt-3 text-3xl font-bold">تسجيل جهاز جديد</h1>
        <p className="mt-2 text-slate-600">سيُنشأ كود فريد تلقائيًا حسب نوع الجهاز، وسيكون هو الرقم التسلسلي والباركود.</p>
      </header>
      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}
      <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-lg bg-white p-6 shadow">
        <label className="block text-sm font-medium">
          نوع الجهاز
          <select value={type} onChange={(event) => setType(event.target.value as AssetType)} className="mt-1 w-full rounded border px-3 py-2">
            {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((value) => <option key={value} value={value}>{ASSET_TYPE_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">
          الموديل
          <input required value={modelName} onChange={(event) => setModelName(event.target.value)} maxLength={160} className="mt-1 w-full rounded border px-3 py-2" placeholder="مثال: HP LaserJet Pro M404" />
        </label>
        <label className="block text-sm font-medium">
          الفرع
          <select required disabled={optionsLoading || branches.length === 0} value={branch} onChange={(event) => setBranch(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100">
            <option value="">اختر الفرع</option>
            {branches.map(({ name }) => <option key={name} value={name}>{name}</option>)}
          </select>
          {!optionsLoading && branches.length === 0 && <span className="mt-1 block text-sm text-amber-700">لا توجد فروع مسجلة. أضف فرعًا أولًا من إعدادات الفروع.</span>}
        </label>
        <label className="block text-sm font-medium">
          الإدارة (اختياري)
          <input value={department} onChange={(event) => setDepartment(event.target.value)} maxLength={160} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="block text-sm font-medium">
          الموظف المسؤول (اختياري)
          <select value={employeeId || (isNewEmployee ? "new" : "")} onChange={(event) => { setIsNewEmployee(event.target.value === "new"); setEmployeeId(event.target.value === "new" ? "" : event.target.value); setEmployeeName(""); setEmployeeEmail(""); }} className="mt-1 w-full rounded border px-3 py-2">
            <option value="">بدون موظف مرتبط</option>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.email ? ` — ${employee.email}` : ""}</option>)}
            <option value="new">تسجيل موظف جديد</option>
          </select>
        </label>
        {isNewEmployee && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              اسم الموظف
              <input value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} maxLength={160} className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <label className="block text-sm font-medium">
              بريد الموظف
              <input type="email" value={employeeEmail} onChange={(event) => setEmployeeEmail(event.target.value)} maxLength={254} className="mt-1 w-full rounded border px-3 py-2" dir="ltr" />
            </label>
            <p className="text-xs text-slate-500 sm:col-span-2">إدخال الاسم والبريد معًا يسجل الموظف لاستخدامه لاحقًا. إذا كان البريد مسجلًا، سيُربط بالسجل الموجود.</p>
          </div>
        )}
        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" disabled={saving || optionsLoading || !branch || (isNewEmployee && (!employeeName.trim() || !employeeEmail.trim()))} className="rounded bg-blue-700 px-5 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-50">
            {saving ? "جارٍ التسجيل..." : "إنشاء ID الجهاز"}
          </button>
          <Link to="/assets" className="rounded border px-5 py-2">إلغاء</Link>
        </div>
      </form>
    </section>
  );
}
