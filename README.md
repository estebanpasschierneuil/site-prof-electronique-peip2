# Affût

**La revue hebdomadaire des entraîneurs de triathlon, déjà triée.**

Affût analyse la semaine d'entraînement de chaque athlète (charge, intensité, fatigue,
récupération, régularité, conformité au plan) et répond aux trois questions que le coach se
pose le dimanche soir : *qui a besoin de moi, pourquoi, et qu'est-ce que j'ajuste pour la
semaine prochaine ?*

![Revue de la semaine](docs/revue.png)

## Essayer en deux minutes

Prérequis : Node.js 20.9 ou plus récent. Aucune base de données à installer.

```bash
npm install
```

```bash
npm run dev
```

Ouvrir http://localhost:3000 puis cliquer sur **Explorer la démonstration**
(ou se connecter avec `claire@demo.affut.app` / `demo-affut`).

Sans `DATABASE_URL`, l'application démarre sur une base Postgres embarquée (PGlite) et y
génère une structure fictive de 18 triathlètes avec six mois d'historique. Les données sont
recalées chaque jour sur la semaine qui vient de s'achever : la démo est toujours « à jour ».

## Ce que voit le coach

| Écran | Rôle |
|---|---|
| **Revue** (`/`) | La synthèse du groupe (volume, séances, ce qui a changé depuis la semaine dernière, échéances, données manquantes), puis la file de la semaine : athlètes classés *Action requise*, *À surveiller*, *Sur les rails*, avec le constat principal, la charge réalisée contre prévue, la fraîcheur, l'indice de préparation et la tendance sur 8 semaines. Un bouton valide d'un coup tous les athlètes sans signal ; la synthèse se copie en texte. |
| **Retours** (`/retours`) | Tous les messages aux athlètes sur une page, pré-rédigés à partir de l'analyse : relire, ajuster, copier ou ouvrir dans la messagerie, marquer comme fait. |
| **Fiche athlète** (`/athletes/:id`) | Le verdict et ses preuves chiffrées, la fourchette de charge conseillée pour la semaine suivante comparée au plan existant, les courbes (charge par sport, condition, fatigue, fraîcheur), la récupération rapportée à la référence individuelle, les séances prévues contre réalisées, un brouillon de message à l'athlète et la note du coach. « Valider et passer au suivant » enchaîne la revue. |
| **Athlètes** (`/athletes`) | Effectif, seuils, prochain objectif, état de la source de données ; création et profil. |
| **Intégrations** (`/integrations`) | Connexions directes, chemin à suivre pour chaque marque de montre, connexions à réparer, athlètes sans source. |
| **Méthode** (`/methode`) | Chaque indicateur, son calcul et ses seuils, lus directement dans la configuration du moteur. |

![Fiche athlète](docs/fiche.png)

Les situations que la démonstration met en scène : progression assimilée, surcharge non
absorbée, signes de maladie, affûtage conforme ou raté, reprise de blessure avec volume de
course qui explose, endurance réalisée trop vite, semaines incomplètes, athlète silencieux,
sport délaissé, sommeil insuffisant, charge monotone, récupération post-course, seuils périmés,
athlète tout juste arrivé.

## Architecture

```
src/
  core/            Moteur d'analyse. Fonctions pures, aucune E/S, aucune dépendance au framework.
    load.ts          charge d'une séance (puissance, allure, FC, ressenti, durée)
    fitness.ts       condition (CTL), fatigue (ATL), fraîcheur (TSB), ratio aigu/chronique, monotonie
    facts.ts         rapprochement prévu/réalisé, références individuelles, indice de préparation
    insights.ts      règles → constats (critique, à surveiller, positif, information)
    recommend.ts     fourchette de charge de la semaine suivante
    message.ts       brouillon de retour à l'athlète
    digest.ts        synthèse du groupe et évolution d'une semaine à l'autre
    sources.ts       réconciliation entre sources, résumé d'un enregistrement seconde par seconde
    analyze.ts       orchestrateur : analyzeWeek(données) → WeeklyAnalysis
    config.ts        tous les seuils, au même endroit
  integrations/    Sources de données
    provider.ts      contrat TrainingDataProvider (activités, récupération, plan)
    oauth.ts         parcours OAuth 2 commun à toutes les plateformes
    strava.ts polar.ts wahoo.ts whoop.ts oura.ts intervals.ts   un fichier par plateforme
    files/parse.ts   import de fichiers FIT, TCX et GPX
    ingest.ts        entrée unique des données : charge, dédoublonnage, fusion de la récupération
    sync.ts          synchronisation incrémentale, renouvellement des jetons, invalidation du cache
    crypto.ts        chiffrement AES-256-GCM des jetons, liens signés
    demo/            générateur déterministe du jeu de démonstration
  db/              Schéma Drizzle, connexion (Postgres ou PGlite), démo, CLI
  server/          Authentification, service d'analyse (cache), requêtes cloisonnées par organisation
  app/             Next.js (App Router) : pages, actions serveur, routes API
  components/      Interface, dont les graphiques SVG (survol, clavier, table de données)
drizzle/           Migrations SQL générées
tests/             Moteur, jeu de démonstration, intégration base de données
```

Quelques choix structurants :

- **Le moteur est isolé et déterministe.** `analyzeWeek` reçoit des données et rend un objet :
  il se teste sans base ni serveur, et pourra tourner ailleurs (tâche de fond, export).
  Une semaine passée est analysée telle qu'elle se présentait à sa clôture.
- **Une seule échelle de charge**, recalculée chez nous avec les seuils de l'athlète, quelle
  que soit la plateforme d'origine : deux athlètes sur deux sources restent comparables.
- **Des règles lisibles plutôt qu'une boîte noire.** Chaque constat porte sa preuve chiffrée
  et son seuil ; la page Méthode est générée depuis `config.ts`.
- **Plusieurs sources par athlète, sans double compte.** Une montre recopie souvent ses séances
  vers Strava, qui les recopie ailleurs. Toute donnée entrante passe par `ingest.ts` : une séance
  reçue deux fois est reconnue (même sport, créneaux qui se recouvrent) et seule la version la plus
  complète est analysée ; la récupération est fusionnée champ par champ selon la fiabilité du capteur.
- **Analyses mises en cache** dans `weekly_analyses` : la revue lit des résultats déjà
  calculés ; une analyse n'est recalculée que si les données de l'athlète, la date de clôture
  ou la version du moteur ont changé.
- **Multi-organisation** : chaque requête est bornée par l'organisation de l'utilisateur
  (`orgId`), y compris dans les actions d'écriture. Testé (`tests/service.test.ts`).
- **Même SQL en démo et en production** : PGlite est un vrai Postgres ; le schéma et les
  migrations sont identiques.

## Passer en production

1. Créer une base Postgres (Supabase, Neon, RDS…) et copier `.env.example` vers `.env` :
   `DATABASE_URL`, `APP_URL`, `APP_ENCRYPTION_KEY` (`openssl rand -base64 32`), `CRON_SECRET`.
2. Appliquer les migrations :

   ```bash
   npm run db:migrate
   ```

3. Construire et lancer :

   ```bash
   npm run build
   ```

   ```bash
   npm start
   ```

   ou utiliser le `Dockerfile` fourni (sortie autonome, utilisateur non privilégié, sonde `/api/health`).
4. Planifier la synchronisation, chaque heure :
   `POST /api/cron/sync` avec l'en-tête `Authorization: Bearer $CRON_SECRET`.

Avec `DATABASE_URL`, le mode démonstration est désactivé par défaut. `npm run db:seed` crée
l'organisation de démonstration à la demande (`DEMO_MODE=true` la maintient à jour).

### Connecter de vraies données

Un athlète peut cumuler plusieurs sources ; elles sont réunies automatiquement.

| Source | Séances | Récupération | Plan | Mise en place |
|---|---|---|---|---|
| intervals.icu | oui, avec zones | VFC, FC de repos, sommeil, ressenti | oui | Identifiant et clé d'API de l'athlète, dans son profil |
| Strava | oui | non | non | Application développeur + lien d'invitation |
| Polar Flow | oui, avec zones de FC | sommeil, Nightly Recharge | non | Application développeur + lien d'invitation |
| Wahoo | oui, avec puissance | non | non | Application développeur + lien d'invitation |
| WHOOP | oui, avec zones de FC | VFC, FC de repos, sommeil | non | Application développeur + lien d'invitation |
| Oura | non | VFC, FC de repos, sommeil | non | Application développeur + lien d'invitation |
| Fichiers FIT, TCX, GPX | oui, puissance normalisée et zones recalculées | non | non | Glisser-déposer dans le profil, par lot |

- **Lien d'invitation** : le profil de l'athlète affiche un lien signé, valable 14 jours. L'athlète
  l'ouvre et connecte lui-même chacune de ses applications. Seules les plateformes dont les
  identifiants sont renseignés (voir `.env.example`) lui sont proposées.
- **Garmin, COROS, Suunto, Zwift, Apple Watch** : pas de connexion directe (elle demande un
  agrément de chaque marque). Leurs séances arrivent par Strava ou intervals.icu, qui se
  synchronisent seuls avec ces marques, ou par leurs fichiers FIT. La page Intégrations détaille
  le chemin pour chaque marque.
- **Autre source** : implémenter `TrainingDataProvider` (une quarantaine de lignes pour une
  plateforme OAuth) et l'inscrire dans `src/integrations/registry.ts`.

## Vérifications

```bash
npm test
```

```bash
npm run typecheck
```

157 tests : calculs du moteur, 18 scénarios de démonstration vérifiés sur 5 dates d'ancrage
(le diagnostic attendu doit tenir un samedi comme un lundi, en hiver comme en été),
dédoublonnage et fusion des sources, lecture de fichiers FIT, TCX et GPX, connecteurs confrontés
aux exemples de réponse des documentations, synthèse du groupe, et intégration sur une vraie base
(migrations, cache, cloisonnement entre organisations).

## Limites connues

- **Aucun connecteur n'a été éprouvé sur un compte réel.** Polar, Wahoo, WHOOP et Oura sont écrits
  et testés contre les exemples de réponse de leur documentation ; Strava et intervals.icu d'après
  leur documentation, sans exemple confronté. Prévoir une passe de validation avec un vrai compte
  pour chacun, et vérifier les conditions d'utilisation de chaque API pour un usage de coaching.
- **Pas de connexion directe à Garmin, COROS, Suunto ni TrainingPeaks** : elle suppose un agrément
  de chaque marque. En attendant, ces athlètes passent par Strava, intervals.icu ou les fichiers.
- **Synchronisation par interrogation horaire** : pas encore de réception en temps réel (webhooks).
- **Polar ne restitue que 30 jours d'historique** : l'historique plus ancien s'importe par fichiers.
- **Pas d'inscription en libre-service** : les organisations et les coachs se créent en base.
  Pas encore de réinitialisation de mot de passe ni d'invitation de coach.
- **Limitation des tentatives de connexion en mémoire**, par processus : à remplacer par un
  compteur partagé derrière plusieurs instances.
- **Pas de saisie manuelle** de séance, de plan ou de questionnaire de récupération : tout
  vient des connecteurs et des fichiers. Les retours se copient ou s'ouvrent dans la messagerie
  du coach ; ils ne sont pas envoyés depuis l'application.
- **Seuils du moteur globaux** : pas encore réglables par organisation ou par athlète.
- **Données de santé** : VFC, FC de repos et sommeil sont des données sensibles au sens du
  RGPD. Consentement explicite de l'athlète, hébergement et contrat de sous-traitance sont à
  cadrer avant d'accueillir de vrais athlètes.
- Interface en français uniquement ; pas de pagination de la revue au-delà de quelques
  centaines d'athlètes.
