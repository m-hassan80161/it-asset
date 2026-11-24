import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppUser } from "../lib/api";
import { ticketsApi } from "../lib/ticketsApi";

interface KnowledgeArticleCreateProps {
  user: AppUser;
}

const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "video/mp4", "video/webm"];
const maxFileSize = 25 * 1024 * 1024;

export function KnowledgeArticleCreate({ user }: KnowledgeArticleCreateProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [solution, setSolution] = useState("");
  const [keywords, setKeywords] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const createArticle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const { data: article } = await ticketsApi.knowledgeCreate({
        title: title.trim(),
        problem: problem.trim(),
        solution: solution.trim(),
        ...(keywords.trim() ? { keywords: keywords.trim() } : {}),
      });

      let failedUploads = 0;
      for (const file of files) {
        try {
          await ticketsApi.knowledgeUpload(article.id, file);
        } catch {
          failedUploads += 1;
        }
      }

      navigate("/knowledge-base", {
        state: {
          notice: failedUploads
            ? `تم حفظ المقال، لكن تعذر رفع ${failedUploads} مرفق. يمكنك إعادة المحاولة من صفحة إضافة مشكلة وحل.`
            : "تمت إضافة الحل إلى قاعدة المعرفة.",
        },
      });
    } catch {
      setError("تعذر حفظ المقال. تحقق من البيانات وحاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <Link to="/knowledge-base" className="inline-block text-blue-700 hover:underline">
        العودة إلى قاعدة المعرفة
      </Link>
      <header>
        <h1 className="text-3xl font-bold">إضافة مشكلة وحل</h1>
        <p className="mt-2 text-slate-600">وثّق المشكلة وطريقة حلها ليستفيد منها فريق الدعم.</p>
      </header>
      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}

      <form onSubmit={createArticle} className="grid gap-4 rounded-lg bg-white p-5 shadow md:grid-cols-2">
        <label className="text-sm font-medium md:col-span-2">عنوان الحل
          <input required minLength={3} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="text-sm font-medium md:col-span-2">وصف المشكلة
          <textarea required minLength={5} maxLength={10000} rows={3} value={problem} onChange={(event) => setProblem(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="text-sm font-medium md:col-span-2">طريقة الحل
          <textarea required minLength={5} maxLength={10000} rows={5} value={solution} onChange={(event) => setSolution(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="text-sm font-medium md:col-span-2">كلمات مفتاحية (اختياري)
          <input maxLength={500} value={keywords} onChange={(event) => setKeywords(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" placeholder="مثال: طابعة، شبكة، كلمة مرور" />
        </label>
        <label className="text-sm font-medium md:col-span-2">
          مرفقات الحل (PDF أو صورة أو فيديو MP4/WebM، 25MB كحد أقصى لكل ملف)
          <input
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.mp4,.webm,application/pdf,image/png,image/jpeg,video/mp4,video/webm"
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              const invalid = selected.find((file) => !allowedTypes.includes(file.type) || file.size > maxFileSize);
              if (invalid) {
                setError("المرفقات المقبولة PDF أو PNG أو JPEG أو MP4 أو WebM، وبحد أقصى 25MB لكل ملف.");
                event.target.value = "";
                setFiles([]);
                return;
              }
              setError("");
              setFiles(selected);
            }}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <p className="text-sm text-slate-500 md:col-span-2">أضاف المقال: {user.fullName}</p>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button disabled={saving} className="rounded bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-60">
            {saving ? "جارٍ حفظ المقال والمرفقات..." : "حفظ المقال"}
          </button>
          <Link to="/knowledge-base" className="rounded border px-4 py-2">إلغاء</Link>
        </div>
      </form>
    </section>
  );
}
