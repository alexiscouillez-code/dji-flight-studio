"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useStudio } from "@/lib/store";
import { Logo } from "@/components/Logo";

export default function Login() {
  const { supabaseConfigured, session } = useStudio();
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!supabaseConfigured) return (
    <div className="panel mx-auto max-w-md p-8 text-center text-sm text-muted">
      L'authentification nécessite Supabase, non configuré sur ce déploiement. <Link href="/settings" className="text-cyan hover:underline">Détails</Link>
    </div>
  );
  if (session) return (
    <div className="panel mx-auto max-w-md p-8 text-center text-sm">Connecté en tant que {session.user.email}. <Link href="/projects" className="text-cyan hover:underline">Vos projets</Link></div>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase()!;
    setBusy(true); setMsg(null);
    try {
      if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/projects");
      } else {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/projects` } });
        if (error) throw error;
        setMsg({ kind: "ok", text: data.session ? "Compte créé." : "Compte créé : confirmez via l'e-mail reçu, puis connectez-vous." });
      }
    } catch (err) { setMsg({ kind: "err", text: (err as Error).message }); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-sm pt-6">
      <div className="mb-6 flex flex-col items-center gap-3 text-center"><Logo size={40} /><h1 className="text-xl font-semibold">{mode === "in" ? "Connexion" : "Créer un compte"}</h1></div>
      <form onSubmit={submit} className="panel space-y-4 p-6">
        <div><label className="label mb-2 block" htmlFor="em">E-mail</label><input id="em" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label mb-2 block" htmlFor="pw">Mot de passe</label><input id="pw" type="password" minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} required className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn btn-primary w-full justify-center" disabled={busy}>{mode === "in" ? "Se connecter" : "Créer le compte"}</button>
        {msg && <p className={`text-sm ${msg.kind === "ok" ? "text-ok" : "text-danger"}`} role="status">{msg.text}</p>}
        <button type="button" className="w-full text-center text-xs text-muted hover:text-text" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>
      </form>
    </div>
  );
}
