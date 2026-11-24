import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { authApi } from "../lib/api";

interface Branch {
  name: string;
}

function getErrorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return "تعذر إكمال التسجيل. حاول مرة أخرى.";
  const message = error.response?.data?.message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.join("، ");
  return "تعذر الاتصال بالخادم. حاول مرة أخرى.";
}

export function Register() {
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [email, setEmail] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [branch, setBranch] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    authApi.registrationBranches()
      .then(({ data }) => setBranches(data))
      .catch((loadError: unknown) => setError(getErrorMessage(loadError)))
      .finally(() => setLoadingBranches(false));
  }, []);

  const requestCode = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await authApi.requestRegistrationCode(normalizedEmail);
      setEmail(normalizedEmail);
      setCodeRequested(true);
      setNotice("إذا كان البريد صالحًا للتسجيل، فسيصلك كود التحقق خلال دقائق.");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const completeRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await authApi.completeRegistration({
        email,
        code,
        fullName: fullName.trim(),
        password,
        branch,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      setNotice("تم إنشاء الحساب بنجاح. يمكنك الآن تسجيل الدخول.");
      window.setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (registrationError: unknown) {
      setError(getErrorMessage(registrationError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <section className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">إنشاء حساب جديد</h1>
          <p className="mt-2 text-sm text-slate-600">
            الحسابات الجديدة تُنشأ بصلاحية مستخدم عادي، ويجب تأكيد البريد الإلكتروني.
          </p>
        </div>

        {error && <p role="alert" className="mb-4 rounded bg-red-100 p-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="mb-4 rounded bg-green-100 p-3 text-sm text-green-800">{notice}</p>}

        {!codeRequested ? (
          <form onSubmit={(event) => void requestCode(event)} className="space-y-4">
            <label className="block text-sm font-medium">
              البريد الإلكتروني
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={submitting || loadingBranches || branches.length === 0}
              className="w-full rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {submitting ? "جارٍ إرسال الكود..." : "إرسال كود التحقق"}
            </button>
            {!loadingBranches && branches.length === 0 && (
              <p className="text-sm text-amber-800">لا توجد فروع مهيأة. يرجى التواصل مع مسؤول النظام.</p>
            )}
          </form>
        ) : (
          <form onSubmit={completeRegistration} className="space-y-4">
            <p className="text-sm text-slate-600" dir="ltr">{email}</p>
            <label className="block text-sm font-medium">
              كود التحقق
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={() => void requestCode()}
              disabled={submitting}
              className="text-sm font-medium text-blue-700 hover:text-blue-900 disabled:opacity-60"
            >
              إعادة إرسال الكود
            </button>
            <label className="block text-sm font-medium">
              الاسم الكامل
              <input
                autoComplete="name"
                required
                maxLength={120}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium">
              الفرع
              <select
                required
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              >
                <option value="">اختر الفرع</option>
                {branches.map(({ name }) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">
              رقم الهاتف (اختياري)
              <input
                type="tel"
                autoComplete="tel"
                maxLength={32}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium">
              كلمة المرور (12 حرفًا على الأقل)
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={256}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium">
              تأكيد كلمة المرور
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={256}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={submitting || password !== confirmation}
              className="w-full rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {submitting ? "جارٍ إنشاء الحساب..." : "تأكيد وإنشاء الحساب"}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-slate-600">
          لديك حساب بالفعل؟{" "}
          <Link to="/login" className="font-medium text-blue-700 hover:text-blue-900">تسجيل الدخول</Link>
        </p>
      </section>
    </main>
  );
}
