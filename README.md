# DJI FLIGHT STUDIO — Real World Cinematic Flight Planner

Studio de préparation, visualisation et simulation de prises de vue aériennes cinématiques.
**Phase 1 (Foundation) livrée.** Voir `docs/architecture/ARCHITECTURE.md`.

## Démarrage (Windows, macOS, Linux)
```bash
corepack enable           # active pnpm
pnpm install
pnpm dev                  # http://localhost:3000
pnpm test                 # 42 tests unitaires (moteurs)
pnpm test:rls             # test RLS sur Postgres embarqué
pnpm typecheck && pnpm build
```
Sans Supabase, l'app fonctionne en **mode invité** (projets dans le navigateur).
Pour les comptes : `apps/web/.env.example` + `docs/api/DATABASE.md`.

## Déploiement Vercel
Root directory : `apps/web` · Framework : Next.js · Install : `pnpm install` (le monorepo est détecté) · Variables : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Matériel de référence
DJI Neo 2 + RC-N2 + iPhone → **mode Companion manuel** : aucun SDK officiel identifié pour ce modèle (voir `docs/compatibility/DJI.md`). DJI Fly reste responsable du pilotage.
