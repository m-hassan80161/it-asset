import { useEffect, useState } from "react";
import { authApi, CpanelAccount } from "../lib/api";

export function CpanelUsers() {
  const [accounts, setAccounts] = useState<CpanelAccount[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingUsername, setDeletingUsername] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      authApi.cpanelAccounts(undefined, search)
        .then(({ data }) => {
          if (active) setAccounts(data);
        })
        .catch(() => {
          if (active) setError("تعذر تحميل نتائج البحث في cPanel Mails.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, search.trim() ? 200 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  const deleteAccount = async (account: CpanelAccount) => {
    const confirmed = window.confirm(
      `هل تريد حذف سجل البريد ${account.username} من cPanel Mails؟ لن يُحذف صندوق البريد الحقيقي أو حساب المستخدم الداخلي.`,
    );
    if (!confirmed) return;

    setDeletingUsername(account.username);
    setError("");
    try {
      await authApi.deleteCpanelAccount(account.username);
      setAccounts((current) => current.filter(({ username }) => username !== account.username));
    } catch {
      setError(`تعذر حذف سجل ${account.username} من cPanel Mails.`);
    } finally {
      setDeletingUsername("");
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <div>
          <h1 className="text-3xl font-bold">cPanel Mails</h1>
          <p className="mt-2 text-slate-600">
            سجل عناوين البريد المحفوظة لاختيارها عند فتح تيكت؛ لا توجد مزامنة حالية ولا تُستخدم هذه السجلات لتسجيل الدخول.
          </p>
        </div>
      </header>

      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}
      <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        هذا السجل لا يتصل بخدمة cPanel. حذف سجل هنا لا يحذف صندوق البريد الحقيقي أو حساب المستخدم الداخلي.
      </p>

      <section className="overflow-x-auto rounded-lg bg-white shadow">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <h2 className="text-xl font-semibold">السجلات المحفوظة ({accounts.length})</h2>
          <label className="w-full text-sm sm:max-w-md">
            بحث في البريد أو النطاق أو حساب الاستضافة
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
              placeholder="اكتب البريد أو النطاق..."
            />
          </label>
        </div>
        {loading ? <p className="p-5">Loading accounts...</p> : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3">البريد</th>
                <th className="p-3">النطاق</th>
                <th className="p-3">حساب الاستضافة</th>
                <th className="p-3">آخر حالة مسجلة</th>
                <th className="p-3">آخر مزامنة مسجلة</th>
                <th className="p-3">الحساب الداخلي المرتبط سابقًا</th>
                <th className="p-3">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((account) => {
                const itamAccount = account.itamAccount;
                return (
                  <tr key={account.username} className="bg-slate-50 text-slate-600">
                    <td className="p-3 font-medium">{account.username}</td>
                    <td className="p-3">{account.domain}</td>
                    <td className="p-3">{account.hostingAccountUsername ?? "Unknown"}</td>
                    <td className="p-3">{account.status}</td>
                    <td className="p-3">
                      {new Date(account.lastSyncedAt).toLocaleString()}
                    </td>
                    <td className="p-3">
                      {itamAccount
                        ? `${itamAccount.fullName} · ${itamAccount.username} · ${itamAccount.role}`
                        : "لا يوجد"}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        disabled={Boolean(deletingUsername)}
                        onClick={() => void deleteAccount(account)}
                        className="rounded border border-red-300 px-3 py-1 text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingUsername === account.username ? "جارٍ الحذف..." : "حذف السجل"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!accounts.length && (
                <tr><td colSpan={7} className="p-6 text-center text-slate-500">
                  {search.trim() ? "لا توجد نتائج مطابقة للبحث." : "لا توجد عناوين بريد محفوظة في cPanel Mails."}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
