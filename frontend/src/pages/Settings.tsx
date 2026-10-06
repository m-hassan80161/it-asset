import { FormEvent, useEffect, useState } from "react";
import { KeyRound, Save, UserRound } from "lucide-react";
import { authApi } from "../lib/api";

interface SettingsProps {
  onCredentialsChanged: () => void;
}

export function Settings({ onCredentialsChanged }: SettingsProps) {
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    authApi.settings()
      .then(({ data }) => {
        if (active) setUsername(data.username);
      })
      .catch(() => {
        if (active) setError("تعذر تحميل إعدادات الحساب.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword && newPassword !== confirmPassword) {
      setError("كلمتا المرور الجديدتان غير متطابقتين.");
      return;
    }
    if (newPassword && newPassword.length < 12) {
      setError("يجب أن تتكون كلمة المرور الجديدة من 12 حرفًا على الأقل.");
      return;
    }

    setSaving(true);
    try {
      await authApi.updateSettings({
        currentPassword,
        username,
        ...(newPassword ? { newPassword } : {}),
      });
      setSuccess("تم تحديث بيانات الدخول. سجّل الدخول مرة أخرى بالبيانات الجديدة.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      window.setTimeout(onCredentialsChanged, 900);
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      setError(
        status === 401
          ? "كلمة المرور الحالية غير صحيحة."
          : "تعذر حفظ الإعدادات. تحقق من اسم المستخدم وحاول مرة أخرى.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4">Loading settings...</div>;

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-3xl font-bold">Settings</h1>
      <p className="mb-6 text-slate-600">Update administrator account and sign-in credentials.</p>

      <form onSubmit={submit} className="space-y-5 rounded-lg bg-white p-6 shadow">
        {error && (
          <div role="alert" className="rounded bg-red-100 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="rounded bg-green-100 p-3 text-sm text-green-800">
            {success}
          </div>
        )}

        <label className="block text-sm font-medium">
          Username
          <span className="relative mt-1 block">
            <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              required
              minLength={3}
              maxLength={64}
              pattern="[a-zA-Z0-9._@-]+"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded border border-slate-300 py-2 pl-9 pr-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </span>
          <span className="mt-1 block font-normal text-slate-500">
            3–64 letters, numbers, dots, underscores, @, or hyphens.
          </span>
        </label>

        <label className="block text-sm font-medium">
          Current password
          <input
            required
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </label>

        <div className="border-t pt-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <KeyRound className="h-4 w-4" />
            Change password (optional)
          </h2>
          <label className="mb-4 block text-sm font-medium">
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
            <span className="mt-1 block font-normal text-slate-500">
              At least 12 characters. Leave blank to keep the current password.
            </span>
          </label>
          <label className="block text-sm font-medium">
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={saving || Boolean(success)}
          className="inline-flex items-center gap-2 rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save settings"}
        </button>
      </form>
    </section>
  );
}
