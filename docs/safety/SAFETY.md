# Flight Safety

- Une validation dans l'application **n'est jamais** une autorisation réglementaire de vol.
- Niveaux : Information · Avertissement · Blocage technique · Validation humaine nécessaire.
- Toujours présents : zones réglementées (aucune source officielle encore intégrée → renvoi vers la carte officielle), obstacles non cartographiés, validation du pilote.
- Règles actuelles (`packages/flight-safety`) : drone inconnu → blocage ; hauteur planifiée > 120 m (référence catégorie ouverte UE) → avertissement ; hauteur relative au décollage en relief → avertissement ; limites documentées du drone (Neo 2 : 60 m en contrôle smartphone) → avertissement ; distance > 500 m → avertissement VLOS.
- Principes non négociables : pilote prioritaire, pas de décollage automatique, pas de désactivation des protections, pas de contournement, interruption toujours possible.
