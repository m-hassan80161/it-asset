import { useEffect, useState } from "react";
import axios from "axios";
import { AppUser, authApi, CpanelAccount } from "../lib/api";

interface CpanelUsersProps {
  user: AppUser;
}

export function CpanelUsers({ user }: CpanelUsersProps) {
  const [accounts, setAccounts] = useState<CpanelAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadAccounts = async () => {
    setError("");
    try {
      const cpanelResponse = await authApi.cpanelAccounts();
      setAccounts(cpanelResponse.data);
    } catch {
      setError("Unable to load synchronized cPanel mailboxes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  const syncNow = async () => {
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const { data } = await authApi.syncCpanelAccounts();
      setNotice(
        `Sync completed: ${data.discovered} new, ${data.active} active, ${data.suspended} suspended; ` +
        `${data.provisioned} ITAM accounts created, ${data.usernameConflicts} username conflicts.`,
      );
      await loadAccounts();
    } catch (error: unknown) {
      const message = axios.isAxiosError(error) ? error.response?.data?.message : undefined;
      const reason = typeof message === "string"
        ? message
        : Array.isArray(message)
          ? message.join("; ")
          : "Check the cPanel URL, configured per-account tokens, and read-only token permissions.";
      setError(`Mailbox sync failed: ${reason} Existing mailbox statuses were left unchanged.`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">cPanel Mailboxes</h1>
          <p className="mt-2 text-slate-600">
            cPanel supplies mailbox identities. ITAM roles and access remain managed separately.
          </p>
        </div>
        <button
          onClick={() => void syncNow()}
          disabled={syncing || user.role !== "SUPER_ADMIN"}
          className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {syncing ? "Syncing..." : "Sync cPanel Mailboxes"}
        </button>
      </header>

      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded bg-green-100 p-3 text-green-800">{notice}</p>}
      <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Active mailboxes are synchronized with read-only cPanel tokens and receive an ITAM account with the Employee role by default. Sign-in verifies the mailbox password over TLS-protected IMAP (port 993) and does not change cPanel. Use Accounts to assign roles; cPanel passwords remain managed in cPanel.
      </p>

      <section className="overflow-x-auto rounded-lg bg-white shadow">
        <h2 className="p-5 text-xl font-semibold">Synchronized mailboxes ({accounts.length})</h2>
        {loading ? <p className="p-5">Loading accounts...</p> : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3">Email address</th>
                <th className="p-3">Domain</th>
                <th className="p-3">cPanel hosting user</th>
                <th className="p-3">Last recorded status</th>
                <th className="p-3">ITAM account</th>
                <th className="p-3">ITAM access / role</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((account) => {
                const itamAccount = account.itamAccount;
                return (
                  <tr key={account.username} className={account.status !== "ACTIVE" ? "bg-slate-50 text-slate-500" : ""}>
                    <td className="p-3 font-medium">{account.username}</td>
                    <td className="p-3">{account.domain}</td>
                    <td className="p-3">{account.hostingAccountUsername ?? "Unknown"}</td>
                    <td className="p-3">{account.status}</td>
                    <td className="p-3">{itamAccount?.fullName ?? "Not linked"}</td>
                    <td className="p-3">
                      {itamAccount
                        ? `${itamAccount.isActive ? "Enabled" : "Disabled"} · ${itamAccount.role}`
                        : "Not enabled"}
                    </td>
                  </tr>
                );
              })}
              {!accounts.length && (
                <tr><td colSpan={6} className="p-6 text-center text-slate-500">No cPanel mailboxes have been synchronized.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
