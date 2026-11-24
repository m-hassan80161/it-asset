import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { KnowledgeArticle } from "../lib/api";
import { ticketsApi } from "../lib/ticketsApi";

interface KnowledgeBaseLocationState {
  notice?: string;
}

function formatFileSize(size: number) {
  return size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.ceil(size / 1024)} KB`;
}

export function KnowledgeBase() {
  const location = useLocation();
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const notice = (location.state as KnowledgeBaseLocationState | null)?.notice;

  const loadArticles = useCallback(async (query: string) => {
    setError("");
    try {
      const { data } = await ticketsApi.knowledgeList(query);
      setArticles(data);
    } catch {
      setError("تعذر تحميل مقالات قاعدة المعرفة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadArticles(search), 250);
    return () => window.clearTimeout(timer);
  }, [loadArticles, search]);

  const openAttachment = async (articleId: string, attachmentId: string) => {
    setError("");
    try {
      const { data } = await ticketsApi.knowledgeAttachment(articleId, attachmentId);
      const [, encoded] = data.fileUrl.split(",", 2);
      if (!encoded) throw new Error("Invalid attachment response");
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: data.mimeType }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = data.fileName;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("تعذر فتح مرفق المقال.");
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">قاعدة المعرفة</h1>
          <p className="mt-2 text-slate-600">ابحث عن حلول المشاكل المتكررة وشارك خطوات الحل مع فريق الدعم.</p>
        </div>
        <Link
          to="/knowledge-base/new"
          className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800"
        >إضافة مشكلة وحل</Link>
      </header>
      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded bg-green-100 p-3 text-green-800">{notice}</p>}

      <label className="block rounded-lg bg-white p-4 shadow">
        <span className="mb-1 block text-sm font-medium">البحث في قاعدة المعرفة</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={200} className="w-full rounded border px-3 py-2" placeholder="ابحث بعنوان المشكلة أو وصفها أو الحل أو الكلمات المفتاحية" />
      </label>

      {loading ? <p>جارٍ تحميل المقالات...</p> : articles.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-slate-600 shadow">لا توجد مقالات مطابقة للبحث.</p>
      ) : (
        <div className="space-y-4">
          {articles.map((article) => (
            <article key={article.id} className="space-y-4 rounded-lg bg-white p-5 shadow">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-xl font-semibold">{article.title}</h2>
                <time className="text-sm text-slate-500">{new Date(article.updatedAt).toLocaleString()}</time>
              </header>
              <section>
                <h3 className="font-medium text-slate-800">المشكلة</h3>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{article.problem}</p>
              </section>
              <section>
                <h3 className="font-medium text-slate-800">طريقة الحل</h3>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{article.solution}</p>
              </section>
              {article.keywords && <p className="text-sm text-slate-500">كلمات مفتاحية: {article.keywords}</p>}
              <p className="text-xs text-slate-500">أضافه {article.authorName}</p>
              {article.attachments.length > 0 && (
                <div className="border-t pt-3">
                  <h3 className="mb-2 font-medium">المرفقات</h3>
                  <ul className="flex flex-wrap gap-2">
                    {article.attachments.map((attachment) => (
                      <li key={attachment.id}>
                        <button
                          type="button"
                          onClick={() => void openAttachment(article.id, attachment.id)}
                          className="rounded border px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
                        >{attachment.fileName} · {formatFileSize(attachment.fileSize)}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
