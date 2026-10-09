import { useState } from "react";
import { AppUser, RemoteSupportType, Ticket, TicketCategory, TicketStatus } from "../lib/api";
import { ticketsApi } from "../lib/ticketsApi";

interface TicketCardProps {
  ticket: Ticket;
  user: AppUser;
  mode: "employee" | "admin" | "readonly";
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

const statuses: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"];

export function TicketCard({ ticket, user, mode, onRefresh, onError }: TicketCardProps) {
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description);
  const [category, setCategory] = useState<TicketCategory>(ticket.category);
  const [remoteSupportType, setRemoteSupportType] = useState<RemoteSupportType | "">(ticket.remoteSupportType ?? "");
  const [remoteSupportId, setRemoteSupportId] = useState(ticket.remoteSupportId ?? "");
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    onError("");
    try {
      await action();
      await onRefresh();
    } catch {
      onError(failure);
    } finally {
      setBusy(false);
    }
  };

  const upload = () => {
    if (!file) return;
    void run(() => ticketsApi.upload(ticket.id, file), "تعذر رفع المرفق.");
    setFile(null);
  };

  const openAttachment = async (attachmentId: string) => {
    onError("");
    try {
      const { data } = await ticketsApi.getAttachment(ticket.id, attachmentId);
      const [metadata, encoded] = data.fileUrl.split(",", 2);
      const mimeType = metadata.match(/^data:(.*);base64$/)?.[1] ?? "application/octet-stream";
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = data.fileName;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      onError("تعذر فتح المرفق.");
    }
  };

  const isRequester = ticket.requesterId === user.id;
  const canEdit = mode === "employee" && isRequester && ticket.status === "OPEN";

  return (
    <article className="space-y-4 rounded-lg bg-white p-5 shadow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{ticket.title}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {ticket.branch} · {ticket.category} · {ticket.priority} · {new Date(ticket.createdAt).toLocaleString()}
          </p>
        </div>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">{ticket.status}</span>
      </div>

      {editing ? (
        <div className="space-y-3">
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} className="w-full rounded border px-3 py-2" aria-label="عنوان التيكت" />
          <select value={category} onChange={(event) => setCategory(event.target.value as TicketCategory)} className="rounded border px-3 py-2">
            {["HARDWARE", "SOFTWARE", "NETWORK", "PRINTER", "OTHER"].map((value) => <option key={value}>{value}</option>)}
          </select>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={10000} rows={3} className="w-full rounded border px-3 py-2" aria-label="وصف التيكت" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">برنامج الدعم عن بُعد
              <select value={remoteSupportType} onChange={(event) => setRemoteSupportType(event.target.value as RemoteSupportType | "")} className="mt-1 w-full rounded border px-3 py-2">
                <option value="">بدون</option><option value="VNC">VNC</option><option value="ANYDESK">AnyDesk</option>
              </select>
            </label>
            <label className="text-sm">رقم VNC أو AnyDesk
              <input value={remoteSupportId} onChange={(event) => setRemoteSupportId(event.target.value)} maxLength={100} disabled={!remoteSupportType} className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100" />
            </label>
          </div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => void run(
              () => ticketsApi.update(ticket.id, {
                title,
                description,
                category,
                remoteSupportType: remoteSupportType || null,
                remoteSupportId: remoteSupportId.trim() || null,
              }),
              "تعذر تحديث الطلب.",
            ).then(() => setEditing(false))} className="rounded bg-blue-700 px-3 py-1 text-white">حفظ التغييرات</button>
            <button onClick={() => setEditing(false)} className="rounded border px-3 py-1">إلغاء</button>
          </div>
        </div>
      ) : (
        <div>
          <p className="whitespace-pre-wrap text-slate-700">{ticket.description}</p>
          {ticket.remoteSupportType && ticket.remoteSupportId && (
            <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">
              {ticket.remoteSupportType === "ANYDESK" ? "AnyDesk" : "VNC"}: <b dir="ltr">{ticket.remoteSupportId}</b>
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span>مقدم الطلب: {ticket.requester?.fullName ?? ticket.requesterName}</span>
        <span>المسؤول: {ticket.assignedAdmin?.fullName ?? ticket.assignedAdminName ?? "غير مستلم"}</span>
      </div>
      {canEdit && !editing && (
        <button onClick={() => setEditing(true)} className="rounded border px-3 py-1 text-sm hover:bg-slate-50">تعديل الطلب</button>
      )}

      {mode === "admin" && (
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <label className="text-sm">
            الحالة
            <select
              value={ticket.status}
              disabled={busy}
              onChange={(event) => void run(
                () => ticketsApi.update(ticket.id, { status: event.target.value as TicketStatus }),
                "تعذر تحديث حالة الطلب.",
              )}
              className="ml-2 rounded border px-2 py-1"
            >
              {statuses.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          {user.role === "ADMIN" && !ticket.assignedAdminId && (
            <button disabled={busy} onClick={() => void run(
              () => ticketsApi.assign(ticket.id, user.id),
              "تعذر استلام الطلب.",
            )} className="rounded border border-blue-700 px-3 py-1 text-blue-700 hover:bg-blue-50">استلام الطلب</button>
          )}
          {(ticket.status === "RESOLVED" || user.role === "SUPER_ADMIN") && ticket.status !== "CLOSED" && (
            <button disabled={busy} onClick={() => void run(
              () => ticketsApi.close(ticket.id),
              "تعذر إغلاق الطلب.",
            )} className="rounded border px-3 py-1">إغلاق</button>
          )}
        </div>
      )}
      {mode === "employee" && isRequester && ticket.status === "RESOLVED" && (
        <button disabled={busy} onClick={() => void run(
          () => ticketsApi.close(ticket.id),
          "تعذر تأكيد الحل وإغلاق الطلب.",
        )} className="rounded bg-green-700 px-3 py-1 text-white">تأكيد الحل وإغلاق الطلب</button>
      )}

      {ticket.attachments.length > 0 && (
        <div className="border-t pt-3">
          <h4 className="mb-2 font-medium">المرفقات</h4>
          <ul className="space-y-1">
            {ticket.attachments.map((attachment) => (
              <li key={attachment.id}>
                <button onClick={() => void openAttachment(attachment.id)} className="text-sm text-blue-700 hover:underline">
                  {attachment.fileName} ({Math.ceil(attachment.fileSize / 1024)} KB)
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {mode !== "readonly" && ticket.status !== "CLOSED" && (
        <label className="block border-t pt-3 text-sm font-medium">
          إضافة مرفق (PDF أو PNG أو JPEG، 5MB كحد أقصى)
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                if (selected && (
                  !["application/pdf", "image/png", "image/jpeg"].includes(selected.type) ||
                  selected.size > 5 * 1024 * 1024
                )) {
                  onError("المرفق يجب أن يكون PDF أو PNG أو JPEG وألا يتجاوز 5MB.");
                  event.target.value = "";
                  setFile(null);
                  return;
                }
                onError("");
                setFile(selected);
              }}
              className="min-w-0 flex-1"
            />
            <button type="button" disabled={!file || busy} onClick={upload} className="rounded border px-3 py-1 disabled:opacity-50">رفع</button>
          </div>
        </label>
      )}

      <div className="space-y-2 border-t pt-3">
        <h4 className="font-medium">التعليقات</h4>
        {ticket.comments.map((item) => (
          <p key={item.id} className="rounded bg-slate-50 p-2 text-sm">
            <span className="font-semibold">{item.author?.fullName ?? item.authorName}:</span> {item.content}
            <time className="ml-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</time>
          </p>
        ))}
        {mode !== "readonly" && (
          <div className="flex gap-2">
            <input value={comment} onChange={(event) => setComment(event.target.value)} maxLength={5000} className="min-w-0 flex-1 rounded border px-3 py-2" placeholder="أضف تعليقًا..." aria-label={`تعليق على ${ticket.title}`} />
            <button disabled={!comment.trim() || busy} onClick={() => void run(
              () => ticketsApi.comment(ticket.id, comment.trim()),
              "تعذر إضافة التعليق.",
            ).then(() => setComment(""))} className="rounded bg-slate-800 px-3 py-2 text-white disabled:opacity-50">إرسال</button>
          </div>
        )}
      </div>
    </article>
  );
}
