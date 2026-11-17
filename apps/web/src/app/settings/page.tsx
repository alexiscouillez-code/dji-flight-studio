"use client";
import Link from "next/link";
import { useState } from "react";
import { CloudUpload, LogIn, LogOut } from "lucide-react";
import { LocalProjectRepository } from "@/lib/repository";
import { PageHeader } from "@/components/PageHeader";
import { useStudio } from "@/lib/store";

export default function Settings() {
  const { supabaseConfigured, session, repo, save, signOut, refresh } = useStudio();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pushLocal() {
    setBusy(true); setMsg(null);
    try {
      const { projects } = await new LocalProjectRepository().list();
      for (const p of projects) await save(p);
      await refresh();
      setMsg(`${projects.length} projet(s) local(aux) envoyé(s) vers votre compte. Les copies locales sont conservées.`);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader eyebrow="Settings" title="Réglages" />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <div className="label mb-4">Compte & stockage</div>
          {!supabaseConfigured ? (
            <div className="space-y-2 text-sm text-muted">
              <p><span className="tag tag-warn mr-2">Non configuré</span>Supabase n'est pas configuré sur ce déploiement.</p>
              <p className="text-xs text-faint">Définir <code className="mono">NEXT_PUBLIC_SUPABASE_URL</code> et <code className="mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, puis appliquer la migration <code className="mono">backend/supabase/migrations</code>. En attendant, les projets sont stockés dans ce navigateur.</p>
            </div>
          ) : session ? (
            <div className="space-y-4 text-sm">
              <p>Connecté : <span className="font-medium">{session.user.email}</span></p>
              <p className="text-xs text-faint">Les projets sont enregistrés dans Supabase. Chaque modification crée une version (table project_versions).</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={pushLocal} disabled={busy || repo?.kind !== "cloud"}><CloudUpload size={15} />Envoyer les projets locaux</button>
                <button className="btn" onClick={signOut}><LogOut size={15} />Se déconnecter</button>
              </div>
              {msg && <p className="text-xs text-muted" role="status">{msg}</p>}
            </div>
          ) : (
            <div className="space-y-3 text-sm text-muted">
              <p>Mode invité : projets stockés dans ce navigateur uniquement.</p>
              <Link href="/login" className="btn btn-primary"><LogIn size={15} />Se connecter / créer un compte</Link>
            </div>
          )}
        </section>
        <section className="panel p-5">
          <div className="label mb-4">Affichage</div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Thème</dt><dd>Sombre (par défaut)</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Qualité graphique 3D</dt><dd><span className="tag">Phase 2</span></dd></div>
            <div className="flex justify-between"><dt className="text-muted">Unités</dt><dd>Mètres · degrés WGS84</dd></div>
          </dl>
        </section>
      </div>
    </>
  );
}
