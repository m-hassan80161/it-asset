import { FormEvent, useEffect, useState } from "react";
import {
  AppUser,
  authApi,
  CreateLocalUserInput,
  UpdateLocalUserInput,
  UserRole,
  inventoryApi,
} from "../lib/api";

type ManagedUser = AppUser & {
  authProvider: "LOCAL" | "CPANEL";
  isActive: boolean;
  createdAt: string;
  deleteAfter: string | null;
};

interface LocalUsersProps {
  user: AppUser;
  onCredentialsChanged: () => void;
}

export function LocalUsers({ user, onCredentialsChanged }: LocalUsersProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("EMPLOYEE");
  const [branch, setBranch] = useState("");
  const [managedBranches, setManagedBranches] = useState("");
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("EMPLOYEE");
  const [editBranch, setEditBranch] = useState("");
  const [editManagedBranches, setEditManagedBranches] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [permanentlyAfter30Days, setPermanentlyAfter30Days] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [branches, setBranches] = useState<Array<{ name: string }>>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(0);
  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const canDelete = isSuperAdmin || user.role === "ADMIN";
  const query = search.trim().toLocaleLowerCase();
  const filteredUsers = users.filter((account) =>
    !query ||
    account.fullName.toLocaleLowerCase().includes(query) ||
    account.username.toLocaleLowerCase().includes(query) ||
    account.role.toLocaleLowerCase().includes(query) ||
    (account.branch ?? "").toLocaleLowerCase().includes(query) ||
    account.managedBranches.some((value) => value.toLocaleLowerCase().includes(query)),
  ).sort((a, b) => a.fullName.localeCompare(b.fullName, "ar", { sensitivity: "base" }));
  const pageSize = 20;
  const pageCount = Math.ceil(filteredUsers.length / pageSize);
  const displayedUsers = filteredUsers.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => {
    setPage((current) => pageCount === 0 ? 0 : Math.min(current, pageCount - 1));
  }, [pageCount]);

  const loadUsers = async () => {
    setError("");
    try {
      const { data } = await authApi.users();
      setUsers(data);
    } catch {
      setError("تعذر تحميل الحسابات.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(0);
  }, [search]);

  useEffect(() => {
    void loadUsers();
    if (isSuperAdmin) {
      inventoryApi.branches()
        .then(({ data }) => setBranches(data))
        .catch(() => setError("تعذر تحميل قائمة الفروع. أضف الفروع من إعدادات الفروع أولًا."));
    }
  }, []);

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const input: CreateLocalUserInput = {
      fullName,
      username,
      password,
      role,
      ...(role === "EMPLOYEE" || role === "ADMIN" ? { branch: branch.trim() } : {}),
      ...(role === "MANAGER"
        ? { managedBranches: managedBranches.split(",").map((value) => value.trim()).filter(Boolean) }
        : {}),
    };
    try {
      await authApi.createUser(input);
      setFullName("");
      setUsername("");
      setPassword("");
      setBranch("");
      setManagedBranches("");
      setCreateOpen(false);
      setPage(0);
      setNotice("تم إنشاء الحساب.");
      await loadUsers();
    } catch {
      setError("تعذر إنشاء الحساب. راجع اسم المستخدم والدور والفرع.");
    }
  };

  const beginEdit = (account: ManagedUser) => {
    setEditing(account);
    setEditName(account.fullName);
    setEditUsername(account.username);
    setEditPassword("");
    setEditRole(account.role);
    setEditBranch(account.branch ?? "");
    setEditManagedBranches(account.managedBranches.join(", "));
    setEditIsActive(account.isActive);
    setDeleteTarget(null);
    setError("");
    setNotice("");
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    setError("");
    setNotice("");
    const payload: UpdateLocalUserInput = {
      fullName: editName.trim(),
      username: editUsername.trim(),
      ...(editPassword ? { password: editPassword } : {}),
      ...(isSuperAdmin
        ? {
            role: editRole,
            branch: editRole === "EMPLOYEE" || editRole === "ADMIN" ? editBranch.trim() : null,
            managedBranches: editRole === "MANAGER"
              ? editManagedBranches.split(",").map((value) => value.trim()).filter(Boolean)
              : [],
            isActive: editIsActive,
          }
        : {}),
    };
    try {
      await authApi.updateUser(editing.id, payload);
      const editingSelf = editing.id === user.id;
      setEditing(null);
      setNotice(editingSelf
        ? "تم تحديث حسابك. سجّل الدخول مرة أخرى بالبيانات المحدثة."
        : "تم تحديث الحساب.");
      if (editingSelf) {
        window.setTimeout(onCredentialsChanged, 800);
        return;
      }
      await loadUsers();
    } catch {
      setError("تعذر تحديث الحساب. تحقق من الصلاحيات والبيانات.");
    }
  };

  const deactivateAccount = async () => {
    if (!deleteTarget) return;
    setError("");
    setNotice("");
    try {
      const { data } = await authApi.deleteUser(deleteTarget.id, permanentlyAfter30Days);
      const deletingSelf = deleteTarget.id === user.id;
      setNotice(data.deleteAfter
        ? `تم تعطيل الحساب وجدولة حذفه نهائيًا في ${new Date(data.deleteAfter).toLocaleDateString()}.`
        : "تم تعطيل الحساب مع الاحتفاظ بتيكتس وتعليقات صاحبه.");
      setDeleteTarget(null);
      setPermanentlyAfter30Days(false);
      if (deletingSelf) {
        window.setTimeout(onCredentialsChanged, 800);
        return;
      }
      await loadUsers();
    } catch {
      setError("تعذر تعطيل الحساب. تحقق من الصلاحيات ومن وجود سوبر أدمن آخر نشط.");
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">{isSuperAdmin ? "إدارة حسابات التطبيق" : user.role === "ADMIN" ? "حسابات موظفي الفرع" : "حسابي"}</h1>
        <p className="mt-2 text-slate-600">
          {isSuperAdmin
            ? "إدارة جميع الحسابات والصلاحيات."
            : user.role === "ADMIN"
              ? `يمكنك تعديل أو تعطيل حسابات الموظفين في فرع ${user.branch ?? "الخاص بك"} فقط.`
              : "يمكنك تعديل بيانات حسابك فقط."}
        </p>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => { setCreateOpen(true); setEditing(null); setError(""); }}
            className="mt-4 rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800"
          >
            إضافة حساب
          </button>
        )}
      </header>
      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded bg-green-100 p-3 text-green-800">{notice}</p>}

      {isSuperAdmin && createOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
        <form role="dialog" aria-modal="true" onSubmit={createUser} className="my-auto grid w-full max-w-2xl gap-4 rounded-lg bg-white p-6 shadow-2xl md:grid-cols-2">
          <h2 className="text-xl font-semibold md:col-span-2">إضافة حساب</h2>
          <label className="text-sm font-medium">الاسم الكامل
            <input required maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm font-medium">اسم المستخدم
            <input required minLength={3} maxLength={64} pattern="[a-zA-Z0-9._@-]+" value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm font-medium">كلمة المرور (12 حرفًا على الأقل)
            <input required type="password" minLength={12} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm font-medium">الدور
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole)} className="mt-1 w-full rounded border px-3 py-2">
              <option value="EMPLOYEE">موظف</option><option value="ADMIN">أدمن فرع</option><option value="MANAGER">مدير</option><option value="SUPER_ADMIN">سوبر أدمن</option>
            </select>
          </label>
          {(role === "EMPLOYEE" || role === "ADMIN") && (
            <label className="text-sm font-medium md:col-span-2">الفرع
              <select required value={branch} onChange={(event) => setBranch(event.target.value)} className="mt-1 w-full rounded border px-3 py-2">
                <option value="">اختر الفرع</option>
                {branches.map(({ name }) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          )}
          {role === "MANAGER" && (
            <label className="text-sm font-medium md:col-span-2">الفروع المدارة (افصل بينها بفاصلة)
              <select required multiple value={managedBranches.split(", ").filter(Boolean)} onChange={(event) => setManagedBranches(Array.from(event.target.selectedOptions, (option) => option.value).join(", "))} className="mt-1 min-h-28 w-full rounded border px-3 py-2">
                {branches.map(({ name }) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          )}
          <div className="flex gap-2 md:col-span-2">
            <button className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800">إنشاء الحساب</button>
            <button type="button" onClick={() => setCreateOpen(false)} className="rounded border px-4 py-2">إلغاء</button>
          </div>
        </form>
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditing(null);
          }}
        >
        <form
          onSubmit={saveEdit}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-account-title"
          className="my-auto grid w-full max-w-2xl gap-4 rounded-lg bg-white p-6 shadow-2xl md:grid-cols-2"
        >
          <h2 id="edit-account-title" className="text-xl font-semibold md:col-span-2">تعديل حساب {editing.fullName}</h2>
          <label className="text-sm font-medium">الاسم الكامل
            <input required maxLength={120} value={editName} onChange={(event) => setEditName(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm font-medium">اسم المستخدم
            <input required minLength={3} maxLength={64} pattern="[a-zA-Z0-9._@-]+" value={editUsername} onChange={(event) => setEditUsername(event.target.value)} disabled={editing.authProvider === "CPANEL"} className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100" />
          </label>
          <label className="text-sm font-medium md:col-span-2">كلمة مرور جديدة (اختياري، 12 حرفًا على الأقل)
            <input type="password" minLength={12} maxLength={256} value={editPassword} onChange={(event) => setEditPassword(event.target.value)} disabled={editing.authProvider === "CPANEL"} className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100" />
            {editing.authProvider === "CPANEL" && <span className="mt-1 block text-xs text-slate-600">Username and password are managed in cPanel.</span>}
          </label>
          {isSuperAdmin && (
            <>
              <label className="text-sm font-medium">الدور
                <select value={editRole} onChange={(event) => setEditRole(event.target.value as UserRole)} className="mt-1 w-full rounded border px-3 py-2">
                  <option value="EMPLOYEE">موظف</option><option value="ADMIN">أدمن فرع</option><option value="MANAGER">مدير</option><option value="SUPER_ADMIN">سوبر أدمن</option>
                </select>
              </label>
              {(editRole === "EMPLOYEE" || editRole === "ADMIN") && (
                <label className="text-sm font-medium">الفرع
                  <select required value={editBranch} onChange={(event) => setEditBranch(event.target.value)} className="mt-1 w-full rounded border px-3 py-2">
                    <option value="">اختر الفرع</option>
                    {branches.map(({ name }) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              )}
              {editRole === "MANAGER" && (
                <label className="text-sm font-medium md:col-span-2">الفروع المدارة (افصل بينها بفاصلة)
                  <select required multiple value={editManagedBranches.split(", ").filter(Boolean)} onChange={(event) => setEditManagedBranches(Array.from(event.target.selectedOptions, (option) => option.value).join(", "))} className="mt-1 min-h-28 w-full rounded border px-3 py-2">
                    {branches.map(({ name }) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input type="checkbox" checked={editIsActive} onChange={(event) => setEditIsActive(event.target.checked)} />
                الحساب نشط
              </label>
            </>
          )}
          <div className="flex gap-2 md:col-span-2">
            <button className="rounded bg-blue-700 px-4 py-2 text-white">حفظ التعديلات</button>
            <button type="button" onClick={() => setEditing(null)} className="rounded border px-4 py-2">إلغاء</button>
          </div>
        </form>
        </div>
      )}

      {deleteTarget && (
        <section className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-5">
          <h2 className="font-semibold">تعطيل حساب {deleteTarget.fullName}</h2>
          <p className="text-sm text-slate-700">سيُمنع الحساب من تسجيل الدخول فورًا، وتظل التيكتس والتعليقات محفوظة.</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={permanentlyAfter30Days} onChange={(event) => setPermanentlyAfter30Days(event.target.checked)} className="mt-1" />
            <span>حذف الحساب نهائيًا بعد 30 يومًا. سيتم فصل اسمه عن سجل الحساب مع الاحتفاظ بنصوص التيكتس والتعليقات لأغراض التدقيق.</span>
          </label>
          <div className="flex gap-2">
            <button onClick={() => void deactivateAccount()} className="rounded bg-red-700 px-4 py-2 text-white">
              {permanentlyAfter30Days ? "تعطيل وجدولة الحذف" : "تعطيل الحساب"}
            </button>
            <button onClick={() => setDeleteTarget(null)} className="rounded border px-4 py-2">إلغاء</button>
          </div>
        </section>
      )}

      <section className="overflow-x-auto rounded-lg bg-white shadow">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <h2 className="text-xl font-semibold">الحسابات ({filteredUsers.length} من {users.length})</h2>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث بالاسم أو البريد أو الدور أو الفرع"
            aria-label="البحث في الحسابات"
            className="w-full rounded border px-3 py-2 sm:max-w-md"
          />
        </div>
        {loading ? <p className="p-5">جارٍ تحميل الحسابات...</p> : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100"><tr><th className="p-3">الاسم</th><th className="p-3">المستخدم</th><th className="p-3">الدور</th><th className="p-3">النطاق</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr></thead>
            <tbody className="divide-y">
              {displayedUsers.map((account) => (
                <tr key={account.id} className={!account.isActive ? "bg-slate-50 text-slate-500" : ""}>
                  <td className="p-3">{account.fullName}</td>
                  <td className="p-3">{account.username}</td>
                  <td className="p-3">{account.role}</td>
                  <td className="p-3">{account.branch ?? (account.managedBranches.join(", ") || "—")}</td>
                  <td className="p-3">
                    {account.isActive ? "نشط" : `معطل${account.deleteAfter ? ` · حذف ${new Date(account.deleteAfter).toLocaleDateString()}` : ""}`}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button onClick={() => beginEdit(account)} className="rounded border px-2 py-1 text-blue-700">تعديل</button>
                      {canDelete && account.isActive && (isSuperAdmin || account.role === "EMPLOYEE") && (
                        <button onClick={() => { setDeleteTarget(account); setEditing(null); setPermanentlyAfter30Days(false); }} className="rounded border border-red-300 px-2 py-1 text-red-700">حذف</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredUsers.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">{users.length ? "لا توجد حسابات مطابقة للبحث." : "لا توجد حسابات ضمن صلاحيتك."}</td></tr>}
            </tbody>
          </table>
        )}
        {!loading && pageCount > 1 && (
          <div className="flex items-center justify-center gap-3 border-t p-4">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className="rounded border px-3 py-1 disabled:opacity-50"
            >السابق</button>
            <span className="text-sm text-slate-600">صفحة {page + 1} من {pageCount} · 20 حسابًا لكل صفحة</span>
            <button
              type="button"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              className="rounded border px-3 py-1 disabled:opacity-50"
            >التالي</button>
          </div>
        )}
      </section>
    </section>
  );
}
