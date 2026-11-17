# Fonctions réellement testées (Phase 1)

| Domaine | Test | Type |
|---|---|---|
| Format projet | migration v0→v1, refus version future, refus nom vide/coords hors bornes/schemaVersion invalide | unitaire |
| Géodésie | haversine (Paris–Londres, 1° lat), cap Chamonix→Mont Blanc, aller-retour ECEF < 1 mm, ENU 100 m nord | unitaire |
| Coordonnées | décimal, virgule française, DMS N/E et N/W, rejets | unitaire |
| GPX | trkpt + ele, points invalides ignorés, fallback rte, fichiers invalides, D+/D- avec hystérésis, refus de D+ si altitude insuffisante | unitaire |
| Trajectoire | Catmull-Rom passe par les points, colinéarité, profil trapèze/triangle, longueur 3D, refus des référentiels mixtes | unitaire |
| Drone | Neo 2 : seule capacité Companion, chaque refus est expliqué et sourcé, adaptateur sans fonction de vol | unitaire |
| Sécurité | validation humaine toujours présente, blocage drone inconnu, alertes 120 m / 60 m / distance | unitaire |
| RLS Supabase | isolation lecture/écriture/suppression, usurpation d'owner, mission sur projet d'autrui, versions | intégration (PGlite) |
| Web | création → édition (DMS) → export JSON → duplication → import → persistance après rechargement ; 0 erreur console ; rendu desktop + mobile | E2E manuel scripté (Playwright) |

**Non testé à ce stade** : auth Supabase contre une vraie instance (aucun projet Supabase connecté), Cesium, simulation, matériel.
