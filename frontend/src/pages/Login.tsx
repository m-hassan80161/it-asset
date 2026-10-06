import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole, UserRound } from "lucide-react";
import { authApi } from "../lib/api";

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await authApi.login(username, password);
      onLogin();
      const destination = (location.state as { from?: string } | null)?.from || "/";
      navigate(destination, { replace: true });
    } catch {
      setError("اسم المستخدم أو كلمة المرور غير صحيحة.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">IT Asset Platform</h1>
          <p className="mt-1 text-slate-600">Sign in to continue</p>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded bg-red-100 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <label className="mb-4 block text-sm font-medium">
          Username
          <span className="relative mt-1 block">
            <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded border border-slate-300 py-2 pl-9 pr-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </span>
        </label>

        <label className="mb-6 block text-sm font-medium">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
