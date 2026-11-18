# Stratégie de compatibilité DJI

Vérification effectuée le **2026-11-17**. À refaire avant toute intégration et à chaque nouveau firmware.

## Constats

| Point | Constat | Source |
|---|---|---|
| MSDK V5 | Disponible **uniquement sur Android**. | DJI SDK Forum — « What devices does Mobile SDK V5 support? » |
| DJI Neo 2 dans MSDK | **Absent** des listes de produits supportés consultées (Matrice, Mini 4 Pro…). | Release notes MSDK, forum SDK |
| Matériel de référence | iPhone + RC-N2 : aucune voie SDK officielle identifiée pour piloter ou lire la télémétrie du Neo 2 depuis une app tierce. | — |
| Limite connue | Hauteur max 60 m en contrôle par application mobile (sans radiocommande). | FAQ officielle DJI Neo 2 |
| DJI Fly | Prend en charge le Neo 2 avec RC-N2, RC-N3 et RC 2 (version 1.19.0). | Notes de version DJI Fly (relayées par DroneXL) |

## Conséquences pour le produit

1. **Neo 2 = mode `manual-companion` uniquement.** DJI FLIGHT STUDIO prépare, simule et guide ; DJI Fly pilote.
2. Aucune lecture de l'écran DJI Fly, aucune automatisation d'interactions, aucune communication avec la radiocommande, aucun contournement.
3. Toutes les capacités autres que `manual-companion` sont affichées **Not Supported**, avec la raison et le workflow manuel correspondant (voir `packages/drone-adapters/src/profiles.ts`).
4. L'interface `DroneAdapter` n'expose une méthode que si elle est réellement implémentée par un SDK officiel ; l'adaptateur Companion n'en expose aucune (testé).

## Profils MSDK V5 (Phase 5, vérifiés le 2026-11-18)

Mini 4 Pro (RC-N2, depuis MSDK 5.13.0), Mini 3 / Mini 3 Pro (depuis 5.3.0), Matrice 30, Matrice 350 RTK, Matrice 4E/4T. Mini 5 Pro : non supporté à ce jour d'après les sources consultées. Toutes les capacités restent « non vérifiées » jusqu'à un test sur matériel.

## Ajouter un drone

1. Vérifier modèle, firmware, SDK, plateformes (iOS/Android), conditions d'utilisation, fonctions réellement disponibles.
2. Créer la fiche `DroneProfile` avec `verifiedOn`, `firmwareChecked`, `sources`.
3. Implémenter l'adaptateur dans `packages/dji-adapter` (natif Android/iOS selon le SDK), tester sur matériel.
4. Ne jamais marquer une capacité `supported` sans test sur appareil.

## Point d'attention iOS
Le développement web se fait sous Windows, mais la compilation, la signature et la distribution d'une app iOS native exigent macOS + Xcode.
