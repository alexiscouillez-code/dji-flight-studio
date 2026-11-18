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
| Cinématique | 20 mouvements + personnalisé : échantillons finis, aperçus ; Orbit 360 (rayon/hauteur constants, boucle fermée) ; Pull Out monotone ; Follow derrière un sujet mobile ; paramètres bornés ; transitions continues ; échantillonnage 10 Hz | unitaire |
| Simulation | mode idéal (vitesse exacte), inertie (limites respectées, retard), alertes vitesse / dégagement / collision, relief inconnu = n/d | unitaire |
| Format v3 | migration v2 → v3, réétiquetage des altitudes Cesium en WGS84 | unitaire |
| Web Phase 3 | placement décollage/sujet, 4 waypoints posés au clic, ajout à la timeline, bibliothèque (21 cartes, ajout d'un plan), timeline (4 plans, lecture, Cinematic Preview), simulateur inertie ; 0 erreur JS | E2E Playwright |
| Companion (moteur) | repères départ/arrivée d'une orbite (distance, direction, H), sens et angle d'orbite, sticks Mode 2, mode Circle ; H relatif au décollage ; alerte 60 m ; export Markdown | unitaire |
| Companion (web) | iPhone 390 px : check-list bloquante, mise en place, plans, minuteur, export .md ; rechargement **hors ligne** via service worker avec le projet en cache ; 0 erreur JS | E2E Playwright |
| Pont / missions | protocole (refus décollage auto, mauvais protocole, JSON invalide), capacités (Neo 2 jamais, Mini 4 Pro seulement ce qui est déclaré + acquittement, appareil différent, sans pont), client (handshake, timeout, messages avant handshake), compilation mission (décimation, hauteurs, blocage sans écrêtage), GPX/GeoJSON | unitaire |
| Web Phase 5 | connexion au double de test, télémétrie, acquittement, envoi, démarrage confirmé, pause, arrêt ; blocage d'une mission trop rapide ; Neo 2 sans commande | E2E Playwright |
| Soleil | lever/coucher Paris solstice (± 4 min), midi solaire, nuit polaire | unitaire |
| Web | création → édition (DMS) → export JSON → duplication → import → persistance après rechargement ; 0 erreur console ; rendu desktop + mobile | E2E manuel scripté (Playwright) |

**Non testé à ce stade** : relief et imagerie Cesium réels depuis l'environnement de test (réseau restreint : vérification à faire sur le site en ligne), inscription Supabase de bout en bout, matériel.
