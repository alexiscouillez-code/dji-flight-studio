# Schéma de base de données (Supabase / PostgreSQL)

Migration : `backend/supabase/migrations/20261117000000_init.sql`

| Table | Rôle | Accès (RLS) |
|---|---|---|
| profiles | Profil utilisateur (créé automatiquement à l'inscription) | propriétaire |
| user_preferences | Qualité graphique, unités, préférences | propriétaire |
| drone_profiles | Catalogue des drones (lecture seule) | lecture publique |
| projects | Projet complet en `data jsonb` (format versionné) + colonnes indexées | propriétaire |
| project_versions | Instantané automatique à chaque modification (50 derniers) | lecture propriétaire, écriture par trigger |
| missions / mission_waypoints / mission_sequences | Structure relationnelle des missions (Phase 3) | propriétaire + parent du même propriétaire |
| cinematic_presets | Presets intégrés (`owner_id null`) et personnels | lecture intégrés + siens |
| saved_locations | Lieux favoris | propriétaire |
| gpx_tracks | Métadonnées GPX ; fichier dans le bucket privé `gpx/<uid>/…` | propriétaire |
| simulation_results | Résultats de simulation (estimations) | propriétaire |

Garanties : UUID, timestamps, contraintes (`lat`/`lon` bornées, noms non vides, référentiel d'altitude énuméré, taille du JSON < 5 Mo), index sur `(owner_id, updated_at)`.

## Test RLS
`pnpm test:rls` exécute la migration réelle dans PGlite (Postgres WASM) avec des schémas `auth`/`storage` simulés, puis vérifie : un utilisateur B ne voit, ne modifie ni ne supprime les projets de A ; B ne peut pas insérer un projet au nom de A ni une mission sur le projet de A ; les versions sont créées et cloisonnées ; les contraintes rejettent un nom vide.

## Mise en service
1. Créer un projet Supabase.
2. SQL Editor → coller la migration (ou `supabase db push`).
3. Vercel → variables `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`. **Jamais** la clé `service_role` côté client.

## Format d'export projet
```json
{ "format": "dji-flight-studio.project", "schemaVersion": 1, "exportedAt": "…", "project": { … } }
```
À l'import : validation JSON → enveloppe → migration de version → validation Zod stricte → nouvel UUID.
