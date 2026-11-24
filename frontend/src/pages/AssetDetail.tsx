import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Link, useLocation, useParams } from "react-router-dom";
import { AssetEmployee, AssetType, TrackedAsset, assetsApi } from "../lib/api";

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  PRINTER: "طابعة",
  SCANNER: "ماسح ضوئي",
  PC: "كمبيوتر",
  MONITOR: "شاشة",
  OTHER: "أخرى",
};

function localDateInputValue() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ar-EG");
}

export function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [asset, setAsset] = useState<TrackedAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    (location.state as { notice?: string } | null)?.notice ?? "",
  );
  const [branches, setBranches] = useState<Array<{ name: string }>>([]);
  const [employees, setEmployees] = useState<AssetEmployee[]>([]);
  const [branch, setBranch] = useState("");
  const [department, setDepartment] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [isNewEmployee, setIsNewEmployee] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [maintenanceDate, setMaintenanceDate] = useState(localDateInputValue);
  const [savingLocation, setSavingLocation] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  const loadAsset = useCallback(async () => {
    if (!id) {
      setError("رقم الجهاز غير موجود.");
      setLoading(false);
      return;
    }
    try {
      setError("");
      const { data } = await assetsApi.detail(id);
      setAsset(data);
      setBranch(data.branch ?? data.location);
      setDepartment(data.department ?? "");
      setEmployeeId(data.employee?.id ?? "");
      setIsNewEmployee(false);
      setEmployeeName("");
      setEmployeeEmail("");
    } catch {
      setError("تعذر تحميل بيانات الجهاز.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadAsset();
  }, [loadAsset]);

  useEffect(() => {
    assetsApi.options()
      .then(({ data }) => {
        setBranches(data.branches);
        setEmployees(data.employees);
      })
      .catch(() => setError("تعذر تحميل خيارات الفروع والموظفين."));
  }, []);

  useEffect(() => {
    if (!asset || !barcodeRef.current) return;
    JsBarcode(barcodeRef.current, asset.assetCode, {
      format: "CODE128",
      displayValue: false,
      height: 48,
      width: 1.6,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
    });
  }, [asset?.assetCode]);

  const updateAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!id) return;
    setSavingLocation(true);
    setError("");
    setNotice("");
    try {
      const { data } = await assetsApi.updateAssignment(id, {
        branch,
        ...(department.trim() ? { department: department.trim() } : {}),
        ...(employeeId
          ? { employeeId }
          : isNewEmployee
            ? { employeeName: employeeName.trim(), employeeEmail: employeeEmail.trim() }
            : {}),
      });
      setAsset(data);
      setNotice("تم تحديث مكان الجهاز وبيانات الموظف وإضافة الحركة إلى السجل.");
    } catch {
      setError("تعذر تحديث بيانات الموقع أو الموظف. راجع البيانات وحاول مرة أخرى.");
    } finally {
      setSavingLocation(false);
    }
  };

  const addMaintenance = async (event: FormEvent) => {
    event.preventDefault();
    if (!id) return;
    setSavingMaintenance(true);
    setError("");
    setNotice("");
    try {
      await assetsApi.addMaintenance(id, {
        maintenanceDate: new Date(`${maintenanceDate}T12:00:00`).toISOString(),
        summary: summary.trim(),
        ...(details.trim() ? { details: details.trim() } : {}),
        ...(invoiceFiles.length ? { files: invoiceFiles } : {}),
      });
      setSummary("");
      setDetails("");
      setInvoiceFiles([]);
      await loadAsset();
      setNotice("تم تسجيل الصيانة والفواتير وربطها بالجهاز.");
    } catch {
      setError("تعذر تسجيل الصيانة.");
    } finally {
      setSavingMaintenance(false);
    }
  };

  const addPhoto = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !photoFile) return;
    setError("");
    setNotice("");
    try {
      await assetsApi.addPhoto(id, photoFile, photoCaption);
      setPhotoFile(null);
      setPhotoCaption("");
      await loadAsset();
      setNotice("تم حفظ الصورة بتاريخها ومكان الجهاز وبيانات الموظف وقت التصوير.");
    } catch {
      setError("تعذر رفع الصورة. استخدم صورة PNG أو JPEG حتى 10MB.");
    }
  };

  const openFileData = (fileUrl: string, fileName: string, mimeType: string, inline = false) => {
    const [, encoded] = fileUrl.split(",", 2);
    if (!encoded) throw new Error("Invalid asset attachment response");
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    if (!inline) anchor.download = fileName;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const downloadInvoice = async (maintenanceId: string, invoiceId: string) => {
    if (!id) return;
    try {
      const { data } = await assetsApi.invoice(id, maintenanceId, invoiceId);
      openFileData(data.fileUrl, data.fileName, data.mimeType);
    } catch {
      setError("تعذر فتح فاتورة الصيانة.");
    }
  };

  const openPhoto = async (photoId: string) => {
    if (!id) return;
    try {
      const { data } = await assetsApi.photo(id, photoId);
      openFileData(data.fileUrl, data.fileName, data.mimeType, true);
    } catch {
      setError("تعذر فتح صورة الجهاز.");
    }
  };

  if (loading) return <p>جارٍ تحميل بيانات الجهاز...</p>;
  if (error && !asset) return <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>;
  if (!asset) return <p>الجهاز غير موجود.</p>;

  return (
    <section className="space-y-6">
      <style>{`@media print { @page { size: 70mm 45mm; margin: 3mm; } body * { visibility: hidden !important; } .asset-label, .asset-label * { visibility: visible !important; } .asset-label { position: fixed; inset: 0 auto auto 0; width: 64mm; padding: 2mm; color: #000; background: #fff; } }`}</style>
      <div className="print:hidden">
        <Link to="/assets" className="text-sm text-blue-700 hover:underline">العودة إلى سجل الأصول</Link>
        <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-lg font-semibold text-blue-800" dir="ltr">{asset.assetCode}</p>
            <h1 className="mt-1 text-3xl font-bold">{asset.modelName}</h1>
            <p className="mt-2 text-slate-600">{ASSET_TYPE_LABELS[asset.type]} · {asset.location}</p>
            {asset.manufacturerSerialNumber && <p className="mt-1 text-sm text-slate-500">السيريال الأصلي للجهاز: <span className="font-mono" dir="ltr">{asset.manufacturerSerialNumber}</span></p>}
          </div>
          <button type="button" onClick={() => window.print()} className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800">طباعة ملصق الجهاز</button>
        </header>
        {notice && <p role="status" className="mt-4 rounded bg-green-100 p-3 text-green-800">{notice}</p>}
        {error && <p role="alert" className="mt-4 rounded bg-red-100 p-3 text-red-800">{error}</p>}
      </div>

      <div className="asset-label hidden rounded border border-slate-300 bg-white p-3 text-center print:block">
        <p className="text-xs">{ASSET_TYPE_LABELS[asset.type]} · {asset.modelName}</p>
        <svg ref={barcodeRef} className="mx-auto mt-1 h-12 max-w-full" aria-label={`باركود الجهاز ${asset.assetCode}`} />
        <p className="font-mono text-lg font-bold tracking-wider" dir="ltr">{asset.assetCode}</p>
        <p className="mt-1 text-xs">{asset.location}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 print:hidden">
        <form onSubmit={(event) => void updateAssignment(event)} className="space-y-3 rounded-lg bg-white p-5 shadow">
          <h2 className="text-xl font-semibold">الموقع والموظف المسؤول</h2>
          <label className="block text-sm font-medium">الفرع
            <select required value={branch} onChange={(event) => setBranch(event.target.value)} className="mt-1 w-full rounded border px-3 py-2">
              <option value="">اختر الفرع</option>
              {branches.map(({ name }) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">الإدارة (اختياري)
            <input value={department} onChange={(event) => setDepartment(event.target.value)} maxLength={160} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="block text-sm font-medium">الموظف المرتبط بالجهاز (اختياري)
            <select value={employeeId || (isNewEmployee ? "new" : "")} onChange={(event) => { setIsNewEmployee(event.target.value === "new"); setEmployeeId(event.target.value === "new" ? "" : event.target.value); setEmployeeName(""); setEmployeeEmail(""); }} className="mt-1 w-full rounded border px-3 py-2">
              <option value="">بدون موظف مرتبط</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.email ? ` — ${employee.email}` : ""}</option>)}
              <option value="new">تسجيل موظف جديد</option>
            </select>
          </label>
          {isNewEmployee && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">اسم الموظف
                <input required value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} maxLength={160} className="mt-1 w-full rounded border px-3 py-2" />
              </label>
              <label className="block text-sm font-medium">البريد الإلكتروني
                <input required type="email" value={employeeEmail} onChange={(event) => setEmployeeEmail(event.target.value)} maxLength={254} className="mt-1 w-full rounded border px-3 py-2" dir="ltr" />
              </label>
              <p className="text-xs text-slate-500 sm:col-span-2">إذا كان البريد مسجلًا من قبل، سيتم ربط الموظف الموجود بدل إنشاء نسخة جديدة.</p>
            </div>
          )}
          <button disabled={savingLocation || !branch || (isNewEmployee && (!employeeName.trim() || !employeeEmail.trim()))} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">
            {savingLocation ? "جارٍ الحفظ..." : "حفظ ونقل الجهاز"}
          </button>
        </form>

        <form onSubmit={(event) => void addMaintenance(event)} className="space-y-3 rounded-lg bg-white p-5 shadow">
          <h2 className="text-xl font-semibold">تسجيل صيانة</h2>
          <label className="block text-sm font-medium">
            تاريخ الصيانة
            <input required type="date" value={maintenanceDate} onChange={(event) => setMaintenanceDate(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="block text-sm font-medium">
            ملخص الصيانة
            <input required value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={200} className="mt-1 w-full rounded border px-3 py-2" placeholder="مثال: تغيير خرطوشة الحبر" />
          </label>
          <label className="block text-sm font-medium">
            تفاصيل إضافية
            <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={4000} rows={3} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="block text-sm font-medium">
            فواتير الصيانة (PDF أو PNG/JPEG، حتى 5 ملفات، 10MB لكل ملف)
            <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setInvoiceFiles(Array.from(event.target.files ?? []))} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <button disabled={savingMaintenance} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">
            {savingMaintenance ? "جارٍ التسجيل..." : "إضافة سجل الصيانة"}
          </button>
        </form>
      </div>

      <form onSubmit={(event) => void addPhoto(event)} className="space-y-3 rounded-lg bg-white p-5 shadow print:hidden">
        <h2 className="text-xl font-semibold">إضافة صورة لحالة الجهاز</h2>
        <p className="text-sm text-slate-600">يُحفظ تاريخ الصورة والفرع والإدارة والموظف كما هي وقت رفعها.</p>
        <label className="block text-sm font-medium">
          صورة PNG أو JPEG (10MB كحد أقصى)
          <input required type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="block text-sm font-medium">وصف (اختياري)
          <input value={photoCaption} onChange={(event) => setPhotoCaption(event.target.value)} maxLength={300} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <button disabled={!photoFile} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">حفظ الصورة</button>
      </form>

      <div className="grid gap-6 lg:grid-cols-2 print:hidden">
        <section className="rounded-lg bg-white p-5 shadow">
          <h2 className="mb-4 text-xl font-semibold">سجل تحركات الجهاز</h2>
          {!asset.locationHistory?.length ? <p className="text-slate-500">لا توجد حركات مسجلة.</p> : (
            <ol className="space-y-3">
              {asset.locationHistory.map((change) => (
                <li key={change.id} className="border-r-2 border-blue-200 pr-3">
                  <p className="font-medium">{change.fromLocation ? `من ${change.fromLocation} إلى ${change.toLocation}` : `تم تسجيل الجهاز في ${change.toLocation}`}</p>
                  {(change.fromDepartment || change.toDepartment) && <p className="text-sm text-slate-600">الإدارة: {change.fromDepartment || "—"} ← {change.toDepartment || "—"}</p>}
                  {(change.fromEmployeeName || change.toEmployeeName) && <p className="text-sm text-slate-600">الموظف: {change.fromEmployeeName || "—"} ← {change.toEmployeeName || "—"}</p>}
                  <p className="mt-1 text-sm text-slate-500">{formatDate(change.changedAt)} · {change.changedByName}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="rounded-lg bg-white p-5 shadow">
          <h2 className="mb-4 text-xl font-semibold">سجل الصيانات</h2>
          {!asset.maintenance?.length ? <p className="text-slate-500">لا توجد صيانات مسجلة.</p> : (
            <ol className="space-y-3">
              {asset.maintenance.map((record) => (
                <li key={record.id} className="border-r-2 border-emerald-200 pr-3">
                  <p className="font-medium">{record.summary}</p>
                  {record.details && <p className="mt-1 whitespace-pre-wrap text-slate-700">{record.details}</p>}
                  <p className="mt-1 text-sm text-slate-500">{formatDate(record.maintenanceDate)} · سجلها {record.createdByName}</p>
                  {!!record.invoices?.length && <ul className="mt-2 flex flex-wrap gap-2">{record.invoices.map((invoice) => <li key={invoice.id}><button type="button" onClick={() => void downloadInvoice(record.id, invoice.id)} className="rounded border px-2 py-1 text-sm text-blue-700 hover:bg-blue-50">{invoice.fileName}</button></li>)}</ul>}
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="rounded-lg bg-white p-5 shadow lg:col-span-2">
          <h2 className="mb-4 text-xl font-semibold">صور حالة الجهاز ({asset.photos?.length ?? 0})</h2>
          {!asset.photos?.length ? <p className="text-slate-500">لا توجد صور مسجلة.</p> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {asset.photos.map((photo) => (
                <button key={photo.id} type="button" onClick={() => void openPhoto(photo.id)} className="rounded border p-3 text-right hover:bg-slate-50">
                  <span className="block font-medium">{photo.caption || photo.fileName}</span>
                  <span className="mt-1 block text-sm text-slate-600">المكان وقت التصوير: {photo.location}{photo.department ? ` · ${photo.department}` : ""}</span>
                  {photo.employeeName && <span className="block text-sm text-slate-600">{photo.employeeName}{photo.employeeEmail ? ` · ${photo.employeeEmail}` : ""}</span>}
                  <span className="mt-1 block text-xs text-slate-500">{formatDate(photo.createdAt)} · أضافها {photo.uploadedByName}</span>
                  <span className="mt-2 block text-sm text-blue-700">فتح الصورة</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
