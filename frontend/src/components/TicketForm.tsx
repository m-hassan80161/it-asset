import { FormEvent, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { authApi, CpanelAccount, RemoteSupportType, TicketCategory, TicketPriority, inventoryApi } from "../lib/api";
import { ticketsApi } from "../lib/ticketsApi";

interface TicketFormProps {
  branch?: string;
  showBranch?: boolean;
  branches?: string[];
  requesterPhone?: string;
  callTicketMode?: boolean;
  onCreated: () => Promise<void>;
}

const categories: TicketCategory[] = ["HARDWARE", "SOFTWARE", "NETWORK", "PRINTER", "OTHER"];
const priorities: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const allowedTypes = ["application/pdf", "image/png", "image/jpeg"];

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function TicketForm({ branch: initialBranch = "", requesterPhone: initialRequesterPhone = "", callTicketMode = false, showBranch, branches, onCreated }: TicketFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TicketCategory>("HARDWARE");
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [requesterLocation, setRequesterLocation] = useState("");
  const [department, setDepartment] = useState("");
  const [requesterPhone, setRequesterPhone] = useState(initialRequesterPhone);
  const [printerName, setPrinterName] = useState("");
  const [printerModel, setPrinterModel] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [remoteSupportType, setRemoteSupportType] = useState<RemoteSupportType | "">("");
  const [remoteSupportId, setRemoteSupportId] = useState("");
  const [branch, setBranch] = useState(initialBranch);
  const [createdAt, setCreatedAt] = useState(localDateTimeValue());
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [emailSuggestions, setEmailSuggestions] = useState<CpanelAccount[]>([]);
  const [searchedEmailPrefix, setSearchedEmailPrefix] = useState("");
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const availableBranches = branches ?? branchOptions;
  const ticketTitle = callTicketMode
    ? [branch.trim(), department.trim()].filter(Boolean).join(" - ")
    : title.trim();
  const normalizedRequesterEmail = requesterEmail.trim().toLowerCase();
  const requesterEmailExists = emailSuggestions.some(
    (account) => account.username.toLowerCase() === normalizedRequesterEmail,
  );
  const canAddRequesterEmail =
    callTicketMode &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedRequesterEmail) &&
    searchedEmailPrefix === normalizedRequesterEmail &&
    !loadingEmails &&
    !requesterEmailExists;

  useEffect(() => {
    if (!callTicketMode || !showBranch) return;
    let active = true;
    setLoadingBranches(true);
    inventoryApi.branches()
      .then(({ data }) => {
        if (active) setBranchOptions(data.map(({ name }) => name));
      })
      .catch(() => {
        if (active) setError("تعذر تحميل قائمة الفروع. أعد المحاولة قبل إنشاء التيكت.");
      })
      .finally(() => {
        if (active) setLoadingBranches(false);
      });
    return () => { active = false; };
  }, [callTicketMode, showBranch]);

  useEffect(() => {
    const prefix = requesterEmail.trim();
    if (!callTicketMode || prefix.length === 0) {
      setEmailSuggestions([]);
      setSearchedEmailPrefix("");
      setLoadingEmails(false);
      return;
    }

    let active = true;
    setEmailSuggestions([]);
    setSearchedEmailPrefix("");
    setLoadingEmails(true);
    const timer = window.setTimeout(() => {
      authApi.cpanelAccounts(prefix)
        .then(({ data }) => {
          if (active) {
            setEmailSuggestions(data);
            setSearchedEmailPrefix(prefix.toLowerCase());
          }
        })
        .catch(() => {
          if (active) setError("تعذر البحث في سجل cPanel Mails.");
        })
        .finally(() => {
          if (active) setLoadingEmails(false);
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [callTicketMode, requesterEmail]);

  const addEmailToCpanel = async () => {
    const email = requesterEmail.trim().toLowerCase();
    if (!email) return;
    setSavingEmail(true);
    setError("");
    try {
      const { data } = await authApi.addCpanelAccount(email);
      setRequesterEmail(data.username);
      setEmailSuggestions([data]);
      setSearchedEmailPrefix(email);
      setNotice("تمت إضافة البريد إلى cPanel Mails.");
    } catch (requestError: unknown) {
      const responseMessage = isAxiosError(requestError) ? requestError.response?.status : undefined;
      if (responseMessage === 409) setSearchedEmailPrefix(email);
      setError(responseMessage === 409
        ? "البريد موجود بالفعل في cPanel Mails. يمكنك اختياره من نتائج البحث."
        : "تعذرت إضافة البريد إلى cPanel Mails.");
    } finally {
      setSavingEmail(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const printerDetails = category === "PRINTER"
      ? `اسم الطابعة: ${printerName.trim()}\nموديل الطابعة: ${printerModel.trim()}\n\n`
      : "";
    const fullDescription = `${printerDetails}${description.trim()}`;
    if (callTicketMode && !branch.trim()) {
      setError("اختر الفرع قبل إنشاء التيكت.");
      setSaving(false);
      return;
    }
    if (callTicketMode && department.trim().length < 2) {
      setError("اكتب اسم الإدارة بحرفين على الأقل.");
      setSaving(false);
      return;
    }
    if (ticketTitle.length < 3 || ticketTitle.length > 160) {
      setError("عنوان الطلب يجب ألا يتجاوز 160 حرفًا.");
      setSaving(false);
      return;
    }
    if (fullDescription.length > 10000) {
      setError("الوصف مع بيانات الطابعة يجب ألا يتجاوز 10000 حرف.");
      setSaving(false);
      return;
    }
    try {
      const { data: ticket } = await ticketsApi.create({
        title: ticketTitle,
        description: fullDescription,
        category,
        priority,
        ...(callTicketMode ? {
          requesterName: requesterName.trim(),
          requesterLocation: requesterLocation.trim(),
          departmentId: department.trim(),
          createdAt: new Date(createdAt).toISOString(),
        } : {}),
        ...(requesterEmail.trim() ? { requesterEmail: requesterEmail.trim() } : {}),
        ...(requesterPhone.trim() ? { requesterPhone: requesterPhone.trim() } : {}),
        ...(remoteSupportType ? { remoteSupportType } : {}),
        ...(remoteSupportId.trim() ? { remoteSupportId: remoteSupportId.trim() } : {}),
        ...(callTicketMode || showBranch ? { branch } : {}),
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
      setRequesterName("");
      setRequesterLocation("");
      setDepartment("");
      setPrinterName("");
      setPrinterModel("");
      setRequesterEmail("");
      setRequesterPhone(initialRequesterPhone);
      setRemoteSupportType("");
      setRemoteSupportId("");
      setCreatedAt(localDateTimeValue());
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
      <h2 className="text-xl font-semibold md:col-span-2">
        {callTicketMode ? "فتح تيكت لموظف أبلغ عن مشكلة هاتفيًا" : "إنشاء طلب دعم"}
      </h2>
      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800 md:col-span-2">{error}</p>}
      {notice && <p role="status" className="rounded bg-green-100 p-3 text-green-800 md:col-span-2">{notice}</p>}
      {initialBranch && (
        <p className="rounded bg-blue-50 p-3 text-sm text-blue-900 md:col-span-2">
          فرعك: <strong>{initialBranch}</strong>
        </p>
      )}
      {callTicketMode && (
        <label className="text-sm font-medium">
          اسم الموظف
          <input
            required
            minLength={2}
            maxLength={120}
            value={requesterName}
            onChange={(event) => setRequesterName(event.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            placeholder="اسم الموظف صاحب المشكلة"
          />
        </label>
      )}
      <label className={`relative text-sm font-medium ${callTicketMode ? "" : "md:col-span-2"}`}>
        {callTicketMode ? "بريد الموظف (اختياري)" : "تقديم الطلب نيابة عن زميل (اختياري)"}
        <input
          type="email"
          maxLength={254}
          value={requesterEmail}
          onChange={(event) => setRequesterEmail(event.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
          placeholder={callTicketMode ? "اكتب البريد يدويًا أو ابحث في cPanel Mails" : "أدخل البريد الإلكتروني للزميل"}
          autoComplete="off"
        />
        <span className="mt-1 block text-xs font-normal text-slate-500">
          {callTicketMode
            ? "اكتب البريد يدويًا أو اختر عنوانًا محفوظًا؛ البريد اختياري."
            : "اترك الحقل فارغًا إذا كنت تقدم الطلب لنفسك. يجب أن يكون الزميل من فرعك."}
        </span>
        {callTicketMode && (emailSuggestions.length > 0 || loadingEmails) && (
          <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded border bg-white shadow-lg">
            {loadingEmails && <p className="px-3 py-2 text-xs text-slate-500">جارٍ البحث...</p>}
            {emailSuggestions.map((account) => (
              <button
                key={account.username}
                type="button"
                onClick={() => {
                  setRequesterEmail(account.username);
                  setEmailSuggestions([]);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
                dir="ltr"
              >{account.username}</button>
            ))}
          </div>
        )}
        {canAddRequesterEmail && (
          <button
            type="button"
            disabled={savingEmail}
            onClick={() => void addEmailToCpanel()}
            className="mt-2 rounded border border-blue-700 px-3 py-1 text-xs text-blue-700 disabled:opacity-50"
          >{savingEmail ? "جارٍ الإضافة..." : "إضافة هذا البريد إلى cPanel Mails لاستخدامه لاحقًا"}</button>
        )}
      </label>
      {callTicketMode && (
        <>
          <label className="text-sm font-medium">
            مكان الموظف
            <input
              required
              minLength={2}
              maxLength={160}
              value={requesterLocation}
              onChange={(event) => setRequesterLocation(event.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
              placeholder="المبنى أو القسم أو المكتب"
            />
          </label>
          <label className="text-sm font-medium">
            تاريخ ووقت فتح التيكت
            <input
              required
              type="datetime-local"
              value={createdAt}
              onChange={(event) => setCreatedAt(event.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
        </>
      )}
      <label className="text-sm font-medium md:col-span-2">
        رقم هاتف للتواصل
        <input
          type="tel"
          inputMode="tel"
          maxLength={32}
          value={requesterPhone}
          onChange={(event) => setRequesterPhone(event.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
          placeholder="أدخل رقم هاتفك للتواصل بخصوص الطلب"
        />
      </label>
      {callTicketMode ? (
        <>
          <label className="text-sm font-medium">
            الفرع
            <select
              required
              disabled={loadingBranches || availableBranches.length === 0 || (!showBranch && Boolean(initialBranch))}
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
            >
              <option value="">اختر الفرع</option>
              {availableBranches.map((value) => <option key={value} value={value}>{value}</option>)}
              {!showBranch && initialBranch && !availableBranches.includes(initialBranch) && (
                <option value={initialBranch}>{initialBranch}</option>
              )}
            </select>
            {loadingBranches && <span className="mt-1 block text-xs text-slate-500">جارٍ تحميل الفروع...</span>}
            {!loadingBranches && availableBranches.length === 0 && !initialBranch && (
              <span className="mt-1 block text-xs font-normal text-red-700">لا توجد فروع مضافة؛ أضف فرعًا من إعدادات الفروع أولًا.</span>
            )}
          </label>
          <label className="text-sm font-medium">
            الإدارة
            <input
              required
              minLength={2}
              maxLength={120}
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
              placeholder="اسم الإدارة أو القسم"
            />
          </label>
          <label className="text-sm font-medium md:col-span-2">
            عنوان الطلب
            <input
              readOnly
              value={ticketTitle}
              className="mt-1 w-full rounded border bg-slate-50 px-3 py-2"
              placeholder="يُكوّن تلقائيًا من الفرع والإدارة"
            />
          </label>
        </>
      ) : (
        <label className="text-sm font-medium">
          عنوان الطلب
          <input required minLength={3} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
      )}
      <label className="text-sm font-medium">
        التصنيف
        <select value={category} onChange={(event) => setCategory(event.target.value as TicketCategory)} className="mt-1 w-full rounded border px-3 py-2">
          {categories.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      {category === "PRINTER" && (
        <>
          <label className="text-sm font-medium">
            اسم الطابعة
            <input
              required
              maxLength={120}
              value={printerName}
              onChange={(event) => setPrinterName(event.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
              placeholder="مثال: طابعة قسم الحسابات"
            />
          </label>
          <label className="text-sm font-medium">
            موديل الطابعة
            <input
              required
              maxLength={120}
              value={printerModel}
              onChange={(event) => setPrinterModel(event.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
              placeholder="مثال: HP LaserJet Pro M404"
            />
          </label>
        </>
      )}
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
      {showBranch && !callTicketMode && (
        <label className="text-sm font-medium">
      الفرع
      <select required disabled={loadingBranches || availableBranches.length === 0} value={branch} onChange={(event) => setBranch(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100">
        <option value="">اختر الفرع</option>
        {availableBranches.map((value) => <option key={value}>{value}</option>)}
      </select>
      {!loadingBranches && availableBranches.length === 0 && (
        <span className="mt-1 block text-xs font-normal text-red-700">لا توجد فروع مضافة؛ أضف فرعًا من إعدادات الفروع أولًا.</span>
      )}
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
