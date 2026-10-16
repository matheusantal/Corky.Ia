"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function friendly(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("already registered")) return "Este e-mail já está cadastrado.";
  if (m.includes("password should be")) return "A senha precisa ter pelo menos 8 caracteres.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail pelo link que enviamos.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "Novos cadastros estão desativados.";
  if (m.includes("rate limit")) return "Muitas tentativas. Aguarde um pouco.";
  return "Não foi possível concluir. Tente novamente.";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setInfo(null);
    const supabase = createClient();
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(friendly(error.message));
      else { router.replace("/"); router.refresh(); }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setError(friendly(error.message));
      else if (data.session) { router.replace("/"); router.refresh(); }
      else setInfo("Cadastro criado. Confirme seu e-mail para entrar.");
    }
    setLoading(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <div className="fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-xl font-bold">R$</div>
          <h1 className="text-2xl font-semibold">Finanças</h1>
          <p className="mt-1 text-sm text-ink-muted">Suas contas, num só lugar.</p>
        </div>
        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="label" htmlFor="email">E-mail</label>
            <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">Senha</label>
            <input id="password" type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-expense">{error}</p>}
          {info && <p role="status" className="text-sm text-income">{info}</p>}
          <button className="btn-primary w-full" disabled={loading}>{loading ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}</button>
        </form>
        <button className="mt-4 w-full text-center text-sm text-ink-muted hover:text-ink" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setInfo(null); }}>
          {mode === "login" ? "Ainda não tenho conta" : "Já tenho conta"}
        </button>
      </div>
    </main>
  );
}
