# Protocole `dfs-bridge/1`

Messages JSON (WebSocket local `ws://127.0.0.1:8765` ou `wss://`) entre l'app web et une **application pont native** qui embarque le SDK officiel DJI (Android, MSDK V5). L'app web ne parle jamais directement à l'appareil.

## Pont → app
| type | contenu | règles |
|---|---|---|
| `hello` | `protocol`, `bridge{name,version,platform}`, `sdk{name,version}`, `aircraft{model,profileId?,firmware?}`\|null, `capabilities[]`, `limits{maxWaypoints?,maxSpeedMs?,maxHeightM?}`, `requiresManualTakeoff: true` | premier message, sous 5 s ; `requiresManualTakeoff` doit valoir `true` sinon le pont est refusé |
| `telemetry` | `timestamp`, `lat`, `lon`, `takeoffRelativeHeightM`, `headingDeg`, `groundSpeedMs`, `batteryPercent?`, `gpsSatellites?`, `flightMode?` | uniquement si `telemetry` est déclarée ; l'app signale les données > 3 s |
| `mission-status` | `state` ∈ idle, uploading, ready, running, paused, finished, aborted, error ; `progress?`, `message?` | |
| `error` | `code`, `message` | |

## App → pont
`hello-ack`, `subscribe-telemetry{hz}`, `upload-mission{mission: dfs-mission/1}`, `start-mission`, `pause-mission`, `resume-mission`, `stop-mission`.

## Garanties côté app
- Validation stricte (Zod) ; tout message invalide est ignoré et journalisé.
- Capacité utilisable = profil ≠ « non supporté » **et** déclarée par le pont **et** appareil détecté = profil du projet. Profils « non vérifiés » : acquittement explicite du pilote.
- Mission bloquée (jamais « corrigée ») si hauteur, vitesse ou nombre de waypoints dépassent les limites.
- Démarrage : seulement depuis l'état `ready`, après confirmation « drone en vol, zone dégagée ». Pas de décollage automatique.

## Format `dfs-mission/1`
`waypoints[]` : `lat`, `lon`, `heightM` (relatif au décollage), `ellipsoidHeightM` (WGS84), `speedMs`, `headingDeg`, `gimbalPitchDeg`, `timeS` ; `manualTakeoff: true` ; `issues[]` ; `blocked`.

## Implémenter un pont Android (étape suivante)
Android Studio + clé d'application DJI + appareil listé par MSDK V5. Le pont lit les capacités réelles via le SDK, ne déclare que ce qu'il a testé, convertit `dfs-mission/1` vers le format de mission du SDK et garde la radiocommande prioritaire. `tools/test-bridge.mjs` est un **double de test** du protocole (aucun appareil) utilisé par les tests E2E.
