# Page « Enseignement Arduino » – version modernisée

Refonte de la page [Enseignement Arduino](https://users.polytech.unice.fr/~pmasson/Enseignement-arduino.htm)
de Pascal Masson (Polytech Nice Sophia, PeiP2).

Tout tient dans un seul fichier : **`index.html`** (HTML, CSS et JavaScript intégrés, aucune dépendance).
Ouvrez-le simplement dans un navigateur pour le visualiser.

## Ce qui a été corrigé

- HTML valide : `<!DOCTYPE html>`, `<html lang="fr">`, URL encodées (plus d'espaces dans les liens).
- Liens en double supprimés (« Instructions pour les projets » / « Github »).
- Coquille « LCE 16x2 » → « LCD 16x2 » ; version du cours d'IA mise à jour (V15).
- Adresse de contact alignée sur celle des supports 2025 (`@univ-cotedazur.fr`).
- Liens morts retirés ou remplacés :
  - Sofiahub (503) et listes de projets 2018-2020 (404) → remplacés par une note explicative ;
  - atmel.com → pages Microchip ; mon-club-elec, practicalarduino, electroniquemagazine → retirés ;
  - livres pointant vers des copies PDF non officielles → pages éditeur officielles.

## Ce qui a été ajouté

- Fiche par support : version, date de mise à jour, nombre de pages, taille du PDF, statut
  (« À jour », « En partie en rédaction »), mots-clés.
- **Recherche instantanée** (insensible aux accents) et **filtres par bloc** ; un clic sur un mot-clé
  lance la recherche correspondante.
- Parcours visuel des 10 TD, progression du cours d'IA, synthèse des règles des projets
  (planning, barème S3/S4, GitHub, rapports de séance).
- Mode **clair / sombre** (automatique + bouton), menu **utilisable sur mobile et au clavier**,
  lien d'évitement, bouton « haut de page », feuille d'impression.

## Mise en ligne

Les PDF et images restent hébergés sur le serveur d'origine (liens absolus vers
`https://users.polytech.unice.fr/~pmasson/`). Si la page est déposée sur ce même serveur, on peut
remplacer ce préfixe par des chemins relatifs.

Pour la visualiser en ligne : activer **GitHub Pages** sur ce dépôt (Settings → Pages → branche, dossier `/`).
