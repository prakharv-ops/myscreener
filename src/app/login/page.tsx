"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const next = useSearchParams().get("next");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/login", { method: "POST", body: JSON.stringify({ password }) });
    if (r.ok) {
      // only same-site relative paths, never an absolute URL from the query string
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      return;
    }
    const j = await r.json().catch(() => ({}));
    setError(j.error ?? "Login failed.");
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="fade-in w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-2xl shadow-black/50">
      <div className="flex items-center gap-2">
        <svg className="h-6 w-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7" strokeLinecap="round" /></svg>
        <h1 className="text-lg font-semibold tracking-tight">MyScreener</h1>
      </div>
      <p className="text-sm text-zinc-400">This screener is private. Enter the password to continue.</p>
      <input
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-amber-400/60"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button disabled={busy || !password} className="w-full rounded-lg bg-amber-400 py-2 text-sm font-medium text-black transition-colors hover:bg-amber-300 disabled:opacity-40">
        {busy ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
