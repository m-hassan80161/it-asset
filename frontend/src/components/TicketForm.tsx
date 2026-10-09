import { FormEvent, useState } from "react";
import { RemoteSupportType, TicketCategory, TicketPriority } from "../lib/api";
import { ticketsApi } from "../lib/ticketsApi";

interface TicketFormProps {
  branch?: string;
  showBranch?: boolean;
  branches?: string[];
  onCreated: () => Promise<void>;
}

const categories: TicketCategory[] = ["HARDWARE", "SOFTWARE", "NETWORK", "PRINTER", "OTHER"];
const priorities: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const allowedTypes = ["application/pdf", "image/png", "image/jpeg"];

export function TicketForm({ branch: initialBranch = "", showBranch, branches, onCreated }: TicketFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TicketCategory>("HARDWARE");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [remoteSupportType, setRemoteSupportType] = useState<RemoteSupportType | "">("");
  const [remoteSupportId, setRemoteSupportId] = useState("");
  const [branch, setBranch] = useState(initialBranch);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data: ticket } = await ticketsApi.create({
        title,
        description,
        category,
        priority,
        ...(remoteSupportType ? { remoteSupportType } : {}),
        ...(remoteSupportId.trim() ? { remoteSupportId: remoteSupportId.trim() } : {}),
        ...(showBranch ? { branch } : {}),
      });
      if (file) {
        try {
          await ticketsApi.upload(ticket.id, file);
        } catch {
          setNotice("تم إنشاء الطلب، لكن تعذر رفع المرفق. يمكنك إضافته من تفاصيل الطلب.");
          await onCreated();
          return;
        }
      }
      setTitle("");
      setDescription("");
      setRemoteSupportType("");
      setRemoteSupportId("");
      setFile(null);
      setNotice("تم إنشاء الطلب بنجاح.");
      await onCreated();
    } catch {
      setError("تعذر إنشاء الطلب. تحقق من البيانات وحاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-lg bg-white p-6 shadow md:grid-cols-2">
      <h2 className="text-xl font-semibold md:col-span-2">إنشاء طلب دعم</h2>
      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800 md:col-span-2">{error}</p>}
      {notice && <p role="status" className="rounded bg-green-100 p-3 text-green-800 md:col-span-2">{notice}</p>}
      <label className="text-sm font-medium">
        عنوان الطلب
        <input required minLength={3} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
      </label>
      <label className="text-sm font-medium">
        التصنيف
        <select value={category} onChange={(event) => setCategory(event.target.value as TicketCategory)} className="mt-1 w-full rounded border px-3 py-2">
          {categories.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">
        الأولوية
        <select value={priority} onChange={(event) => setPriority(event.target.value as TicketPriority)} className="mt-1 w-full rounded border px-3 py-2">
          {priorities.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">
        برنامج الدعم عن بُعد (اختياري)
        <select value={remoteSupportType} onChange={(event) => setRemoteSupportType(event.target.value as RemoteSupportType | "")} className="mt-1 w-full rounded border px-3 py-2">
          <option value="">بدون</option>
          <option value="VNC">VNC</option>
          <option value="ANYDESK">AnyDesk</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        رقم VNC أو AnyDesk
        <input
          value={remoteSupportId}
          onChange={(event) => setRemoteSupportId(event.target.value)}
          maxLength={100}
          disabled={!remoteSupportType}
          required={Boolean(remoteSupportType)}
          className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
          placeholder={remoteSupportType === "ANYDESK" ? "رقم AnyDesk" : "رقم VNC"}
        />
      </label>
      {showBranch && (
        <label className="text-sm font-medium">
          الفرع
          {branches?.length ? (
            <select required value={branch} onChange={(event) => setBranch(event.target.value)} className="mt-1 w-full rounded border px-3 py-2">
              <option value="">اختر الفرع</option>
              {branches.map((value) => <option key={value}>{value}</option>)}
            </select>
          ) : <input required value={branch} onChange={(event) => setBranch(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />}
        </label>
      )}
      <label className="text-sm font-medium md:col-span-2">
        وصف المشكلة
        <textarea required minLength={5} maxLength={10000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
      </label>
      <label className="text-sm font-medium md:col-span-2">
        مرفق (PDF أو PNG أو JPEG، بحد أقصى 5MB)
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            if (selected && (!allowedTypes.includes(selected.type) || selected.size > 5 * 1024 * 1024)) {
              setError("المرفق يجب أن يكون PDF أو PNG أو JPEG وألا يتجاوز 5MB.");
              event.target.value = "";
              setFile(null);
              return;
            }
            setError("");
            setFile(selected);
          }}
          className="mt-1 block w-full rounded border px-3 py-2"
        />
      </label>
      <button disabled={saving} className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60 md:col-span-2">
        {saving ? "جارٍ الإرسال..." : "إرسال الطلب"}
      </button>
    </form>
  );
}
