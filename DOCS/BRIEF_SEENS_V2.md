# Brief de développement — Xel-E v2

> Plateforme e-learning pour les collégiens sénégalais (Maths, PC, SVT).
> Redéveloppement complet from scratch. Ce document est le contrat de travail de Claude Code :
> chaque phase doit être livrée, testée et validée avant de passer à la suivante.

---

## 1. Contexte et vision

Xel-E (Support Électronique pour l'Enseignement Scientifique) v1 était un mémoire de Master 2022
(Angular / Express / MongoDB). La v2 vise une plateforme de production avec :

- **Élèves** : cours, exercices, quiz, examens blancs BFEM, progression gamifiée, forum modéré, mode hors-ligne.
- **Professeurs** : studio de création de contenus (cours, quiz) avec circuit de validation, statistiques.
- **Parents** : compte lié à l'enfant, résumé hebdomadaire d'activité (WhatsApp/SMS).
- **Admins** : validation de contenus, modération, gestion des utilisateurs et abonnements.
- **Modèle** : freemium — contenu de base gratuit, premium (examens blancs, suivi parental) via Wave / Orange Money.

Contraintes clés du contexte sénégalais : connexion intermittente (PWA offline-first),
data coûteuse (payloads légers, vidéos sur YouTube), utilisateurs mineurs (protection des données, modération).

---

## 2. Stack technique imposée

| Couche | Choix | Justification |
|---|---|---|
| Frontend | **Next.js 15+ (App Router), TypeScript, Tailwind CSS** | SSR pour le SEO, PWA |
| Backend | **NestJS, TypeScript** | Architecture modulaire, testabilité |
| ORM / BD | **Prisma + PostgreSQL 16** | Données relationnelles, migrations versionnées |
| Cache / files | **Redis + BullMQ** | Sessions, jobs de notifications |
| Stockage fichiers | **S3 compatible (MinIO en dev)** | PDF de cours, images |
| Tests unitaires | **Vitest** (front et back) | Rapide, compatible TS |
| Tests e2e | **Playwright** | Parcours réels multi-navigateurs |
| Tests API | **Supertest** (intégration NestJS) | Endpoints testés sans navigateur |
| CI | **GitHub Actions** | lint → types → unit → e2e → build |
| Conteneurisation | **Docker + Docker Compose** | Dev reproductible et déploiement VPS |
| Monorepo | **pnpm workspaces + Turborepo** | `apps/web`, `apps/api`, `packages/shared` |

Structure du dépôt :

```
seens/
├── apps/
│   ├── web/            # Next.js
│   └── api/            # NestJS
├── packages/
│   ├── shared/         # types, DTO zod, constantes (niveaux, matières)
│   └── config/         # eslint, tsconfig partagés
├── e2e/                # tests Playwright
├── docker-compose.yml  # postgres, redis, minio, mailhog
└── .github/workflows/ci.yml
```

---

## 3. Règles de travail pour Claude Code

1. **Une phase = une branche + une PR.** Ne jamais commencer la phase N+1 tant que la phase N n'est pas validée.
2. **Definition of Done d'une phase** (toutes obligatoires) :
   - [ ] Le code compile sans erreur TypeScript (`pnpm typecheck`).
   - [ ] Lint sans erreur (`pnpm lint`).
   - [ ] Tous les tests unitaires de la phase passent, et les anciens ne régressent pas (`pnpm test`).
   - [ ] Tous les tests e2e de la phase passent (`pnpm e2e`).
   - [ ] Couverture ≥ 80 % sur les services métier de la phase.
   - [ ] Migration Prisma réversible si le schéma change.
   - [ ] Un paragraphe de résumé dans `CHANGELOG.md` (fait, décisions, dette éventuelle).
   - [ ] **STOP : demander la validation humaine avant de continuer.**
3. **TDD pragmatique** : écrire d'abord les tests des règles métier (scoring, droits d'accès, paiements), puis l'implémentation.
4. **Sécurité par défaut** : validation zod sur toutes les entrées, guards NestJS sur toutes les routes non publiques, jamais de secret en dur (`.env` + `.env.example` tenu à jour).
5. **Données de mineurs** : minimiser la collecte (pas de téléphone élève obligatoire), pseudonymes publics sur le forum, consentement parental à l'inscription des moins de 15 ans.
6. **Français partout** dans l'UI ; code et commits en anglais.
7. En cas d'ambiguïté fonctionnelle : **poser la question plutôt que supposer**, et consigner la décision dans `docs/decisions.md`.

---

## 4. Phases de développement

### Phase 0 — Bootstrap du monorepo et CI

**Objectif** : un squelette qui compile, se lance en une commande et passe une CI verte.

**Tâches**
- Initialiser pnpm workspaces + Turborepo, `apps/web` (Next.js) et `apps/api` (NestJS) minimales.
- `docker-compose.yml` : postgres, redis, minio, mailhog. Healthchecks inclus.
- ESLint + Prettier + tsconfig partagés dans `packages/config`.
- Endpoint `GET /health` sur l'API (statut BD + Redis).
- Workflow GitHub Actions : install → lint → typecheck → test → build.

**Tests unitaires**
- `HealthService` : renvoie `ok` quand BD et Redis répondent, `degraded` sinon (mocks).

**Tests e2e**
- Playwright : la page d'accueil Next.js se charge et affiche le nom de la plateforme.
- Supertest : `GET /health` renvoie 200 avec le bon schéma JSON.

**Validation** : `docker compose up` + `pnpm dev` suffisent à lancer tout le projet ; CI verte sur la PR.

---

### Phase 1 — Schéma de base de données et seed

**Objectif** : modèle Prisma complet, migré, avec données de démonstration.

**Tâches**
- Modèles Prisma : `User` (rôles ELEVE, PROFESSEUR, PARENT, ADMIN), `ParentLink`, `Niveau` (6e→3e),
  `Matiere` (Maths, PC, SVT), `Chapitre`, `Lecon` (statut BROUILLON/EN_REVUE/PUBLIE, version),
  `Quiz`, `Question` (QCM, vrai/faux, réponse courte), `Tentative`, `Progression`, `Badge`, `BadgeUtilisateur`,
  `SujetForum`, `Message`, `Signalement`, `Abonnement`, `Paiement`, `Notification`.
- Contraintes : unicité email, index sur les FK fréquentes, suppression douce (`deletedAt`) sur User et contenus.
- Script `pnpm seed` : 4 niveaux × 3 matières, 2 chapitres/matière, 3 leçons/chapitre, 1 quiz/leçon,
  comptes de démo (élève, prof, parent, admin).

**Tests unitaires**
- Validateurs zod des DTO partagés (`packages/shared`) : email, mot de passe, énumérations de rôles/statuts.
- Fonctions du seed : idempotence (relancer le seed ne duplique rien).

**Tests e2e**
- Test d'intégration : `prisma migrate reset` + seed → les comptages attendus (niveaux, matières, leçons) sont exacts.
- Migration up puis down : la base revient à l'état antérieur sans erreur.

**Validation** : `npx prisma studio` montre le schéma complet peuplé ; ERD généré (`prisma-erd-generator`) commité dans `docs/`.

---

### Phase 2 — Authentification, rôles et conformité mineurs

**Objectif** : inscription/connexion sécurisées pour les 4 rôles, avec les garde-fous pour les mineurs.

**Tâches**
- Inscription élève (nom, email OU identifiant sans email, niveau, mot de passe), professeur (validation admin requise), parent.
- Connexion JWT access (15 min) + refresh token rotatif en cookie httpOnly ; déconnexion ; réinitialisation de mot de passe par email.
- Hash argon2. Rate limiting sur les routes d'auth (Redis).
- Guards NestJS par rôle (`@Roles()`), décorateur `@CurrentUser()`.
- Consentement parental : un élève déclaré < 15 ans doit fournir un contact parent ; le compte reste limité (pas de forum) tant que le parent n'a pas confirmé par lien.
- Pages front : inscription, connexion, mot de passe oublié, avec gestion d'erreurs en français.

**Tests unitaires**
- `AuthService` : hash/vérification, génération et rotation des refresh tokens, invalidation à la déconnexion.
- Guards : accès refusé/autorisé par rôle sur des routes factices.
- Règle mineur : < 15 ans sans confirmation parentale ⇒ `forumAccess = false`.

**Tests e2e**
- Parcours complet : inscription élève → email de confirmation (mailhog) → connexion → accès au tableau de bord.
- Un élève ne peut pas accéder à une route admin (403 + redirection front).
- Rotation de token : après expiration de l'access token, la session continue sans re-login.
- Rate limiting : 6 tentatives de connexion échouées ⇒ 429.

**Validation** : matrice d'accès (rôle × ressource) documentée dans `docs/acces.md` et couverte par les tests.

---

### Phase 3 — Contenus pédagogiques (lecture)

**Objectif** : l'élève navigue niveau → matière → chapitre → leçon, lit un cours paginé et télécharge le PDF.

**Tâches**
- API CRUD contenus (admin seulement pour l'écriture à ce stade), publication avec versionnage.
- Rendu leçon : contenu riche (Markdown/MDX stocké en BD), pagination par sections, formules via KaTeX, images depuis S3.
- Génération et téléchargement du PDF d'une leçon publiée.
- Front élève : navigation par niveau/matière, page leçon responsive, fil d'Ariane.
- SEO : leçons publiées rendues côté serveur, sitemap.xml, métadonnées OpenGraph.

**Tests unitaires**
- Service de publication : seule une leçon EN_REVUE peut passer PUBLIE ; publier crée une nouvelle version immuable.
- Convertisseur Markdown → HTML : échappement XSS (payloads de script neutralisés).
- Politique d'accès : brouillons invisibles pour les non-admins.

**Tests e2e**
- Un admin crée et publie une leçon → elle apparaît dans la navigation élève → l'élève l'ouvre et la pagine.
- Le téléchargement PDF renvoie un fichier valide (content-type, taille > 0).
- Une leçon en brouillon renvoie 404 pour un élève (API et front).

**Validation** : Lighthouse SEO ≥ 90 sur une page leçon publiée.

---

### Phase 4 — Moteur de quiz et correction automatique

**Objectif** : l'élève passe un quiz, obtient score et corrigé, ses tentatives sont historisées.

**Tâches**
- Types de questions : QCM (une ou plusieurs bonnes réponses), vrai/faux, réponse courte (tolérance casse/accents).
- Déroulé : démarrage d'une tentative, réponses envoyées au fil de l'eau (reprise possible), soumission finale, correction côté serveur uniquement.
- Barème configurable par question ; feedback par question après soumission.
- Anti-triche minimal : les bonnes réponses ne transitent jamais vers le client avant soumission.
- Front : composant quiz accessible (clavier), écran de résultat avec corrigé.

**Tests unitaires**
- Scoring : cas nominaux et limites (aucune réponse, réponses partielles sur QCM multiple, normalisation des réponses courtes : « Photosynthèse » = « photosynthese »).
- Reprise de tentative : les réponses déjà enregistrées sont conservées.
- Le payload public d'un quiz ne contient aucun champ `correct`.

**Tests e2e**
- Parcours élève : ouvre un quiz → répond → soumet → voit score et corrigé → la tentative apparaît dans son historique.
- Interruption : fermer l'onglet en cours de quiz puis revenir ⇒ reprise à la même question.

**Validation** : revue manuelle d'un quiz seedé de chaque type de question.

---

### Phase 5 — Progression et gamification

**Objectif** : tableau de bord élève avec progression réelle, XP, badges et séries.

**Tâches**
- Événements de progression : leçon terminée, quiz réussi (≥ 60 %), série de jours actifs (streak).
- Calcul d'XP et attribution de badges (première leçon, 7 jours de suite, chapitre complété, 100 % à un quiz…).
- Tableau de bord : progression par matière/chapitre, badges, streak, dernières activités.
- Classement optionnel par niveau, anonymisé par pseudonyme, désactivable par l'élève.

**Tests unitaires**
- Machine d'attribution des badges : chaque règle testée isolément, idempotence (pas de double attribution).
- Calcul de streak : fuseaux horaires (Africa/Dakar), jour manqué ⇒ remise à zéro, même jour ⇒ pas d'incrément.
- Agrégat de progression chapitre = f(leçons terminées, quiz réussis).

**Tests e2e**
- Terminer une leçon + réussir son quiz ⇒ le tableau de bord reflète la progression et l'XP sans rechargement manuel.
- Le badge « première leçon » apparaît avec sa notification in-app.

**Validation** : les chiffres du tableau de bord recoupent les données BD sur les comptes de démo.

---

### Phase 6 — Studio professeur et circuit de validation

**Objectif** : les professeurs créent des contenus soumis à validation admin — la réponse au problème n°1 de la v1 (le contenu).

**Tâches**
- Espace prof : éditeur de leçon (MDX + aperçu), générateur de quiz, gestion de ses brouillons.
- Workflow : BROUILLON → soumission → EN_REVUE → validation admin (PUBLIE) ou rejet avec commentaires.
- Notifications in-app au prof à chaque changement de statut.
- Statistiques prof : vues, taux de réussite aux quiz, sur ses contenus publiés.
- Attribution visible : « Cours proposé par Pr X » sur les contenus publiés.

**Tests unitaires**
- Machine à états du workflow : transitions autorisées/interdites (un prof ne peut pas publier directement).
- Droits : un prof ne peut modifier que ses propres brouillons ; un contenu EN_REVUE est verrouillé pour lui.
- Statistiques : agrégats corrects sur données synthétiques.

**Tests e2e**
- Parcours complet : prof crée une leçon + quiz → soumet → admin voit la file de revue → rejette avec commentaire → prof corrige → admin valide → contenu visible côté élève avec attribution.

**Validation** : démonstration du circuit complet avec les comptes de démo.

---

### Phase 7 — Forum modéré

**Objectif** : le forum d'entraide de la v1, mais sûr pour des mineurs.

**Tâches**
- Sujets par niveau/matière, messages, réponses, pièces jointes limitées (images, PDF ≤ 5 Mo, scannées côté serveur).
- Pseudonymes obligatoires en public ; jamais d'email ni de nom complet affiché.
- Plus d'anonymes (faille v1) : il faut un compte confirmé pour poster.
- Signalement en un clic ; file de modération admin ; masquage immédiat au 3e signalement en attendant la revue.
- Filtre automatique de premier niveau (liste de termes, liens externes bloqués par défaut pour les élèves).
- Badge « Professeur » sur les réponses des profs.

**Tests unitaires**
- Filtre de contenu : termes bloqués, détection de liens, faux positifs documentés.
- Règle des 3 signalements : masquage automatique, réapparition si l'admin innocente le message.
- Sérialisation publique d'un message : aucun champ personnel (email, nom) présent.

**Tests e2e**
- Élève crée un sujet → un autre répond → le premier signale la réponse ×3 (comptes distincts) → la réponse est masquée → l'admin la restaure ou la supprime.
- Un élève < 15 ans non confirmé par un parent ne voit pas le forum.

**Validation** : revue de la charte de modération dans `docs/moderation.md`.

---

### Phase 8 — Espace parent et notifications

**Objectif** : impliquer les parents, absence identifiée dès la problématique du mémoire v1.

**Tâches**
- Liaison parent-enfant : l'élève (ou l'admin) génère un code, le parent le saisit ; multi-enfants supporté.
- Tableau de bord parent : temps d'activité, leçons terminées, scores récents, streak, par enfant.
- Résumé hebdomadaire automatique (job BullMQ, dimanche 18h Africa/Dakar) : in-app + email, et WhatsApp/SMS via un provider abstrait (`NotificationChannel` : implémentations mock en dev, provider réel configurable).
- Préférences de notification par parent (canaux, fréquence, désinscription).

**Tests unitaires**
- Génération/expiration des codes de liaison (usage unique, TTL 48 h).
- Composition du résumé hebdo : contenu correct selon l'activité de la semaine, semaine vide ⇒ message adapté.
- Dispatch multi-canaux : le provider mock reçoit exactement les messages attendus ; échec d'un canal ⇒ retry avec backoff.

**Tests e2e**
- Parcours : parent s'inscrit → saisit le code → voit le tableau de bord de l'enfant.
- Déclenchement manuel du job hebdo en environnement de test ⇒ notification in-app visible + email dans mailhog.
- Un parent ne peut pas voir les données d'un enfant non lié (403).

**Validation** : contenu du résumé hebdo relu et approuvé (ton, langue, données affichées).

---

### Phase 9 — Module BFEM (annales et examens blancs)

**Objectif** : l'argument d'acquisition pour les 3e — se préparer réellement à l'examen.

**Tâches**
- Banque d'annales par matière/année (PDF sujets + corrigés téléchargeables).
- Examens blancs chronométrés : durée officielle, minuteur serveur (pas seulement client), soumission automatique à la fin du temps.
- Simulation de moyenne : notes obtenues → estimation par rapport au barème BFEM.
- Historique des examens blancs avec évolution dans le temps (graphique).
- Contenu premium : accès contrôlé par l'abonnement (préparation de la phase 10, flag `premium` dès maintenant).

**Tests unitaires**
- Minuteur : soumission après expiration ⇒ seules les réponses antérieures à la limite comptent.
- Calcul de la simulation de moyenne : coefficients corrects, arrondis documentés.
- Garde premium : contenu flaggé inaccessible sans abonnement actif.

**Tests e2e**
- Élève 3e lance un examen blanc → le minuteur s'affiche → à expiration (durée raccourcie en test), soumission automatique et écran de résultats.
- L'historique montre les deux examens passés avec leurs scores.

**Validation** : un examen blanc complet relu par toi (fidélité au format BFEM).

---

### Phase 10 — Paiements Wave / Orange Money et freemium

**Objectif** : monétisation adaptée au marché sénégalais, robuste aux réalités des webhooks.

**Tâches**
- Plans : Gratuit / Premium mensuel / Premium annuel (prix configurables en base).
- Intégration Wave et Orange Money derrière une interface commune `PaymentProvider` (checkout, vérification, webhook). Sandbox/mock complet en dev et en test.
- Webhooks : vérification de signature, **idempotence** (un même événement rejoué ne crée pas deux paiements), file de retraitement des échecs.
- Cycle d'abonnement : activation à paiement confirmé, expiration, relance J-3, rétrogradation douce (les données restent, l'accès premium se ferme).
- Factures/reçus téléchargeables ; page « Mon abonnement ».

**Tests unitaires**
- Idempotence des webhooks : même `ref_externe` traité deux fois ⇒ un seul paiement.
- Signature invalide ⇒ 401 et aucun effet en base.
- Transitions d'abonnement : actif → expiré → renouvelé ; chevauchements interdits.

**Tests e2e**
- Parcours avec provider mock : élève choisit Premium → checkout simulé → webhook de confirmation → l'examen blanc premium devient accessible immédiatement.
- Expiration simulée ⇒ le contenu premium redevient verrouillé avec un message clair (pas d'erreur brute).

**Validation** : test manuel en sandbox réelle des deux providers avant toute mise en production.

---

### Phase 11 — PWA hors-ligne et performance

**Objectif** : la fonctionnalité différenciante — apprendre sans connexion.

**Tâches**
- Service worker (Serwist/Workbox) : app shell précaché, leçons consultées disponibles hors-ligne, bouton « Télécharger ce chapitre ».
- File d'attente hors-ligne : réponses de quiz saisies sans réseau, synchronisées au retour de la connexion (résolution : le serveur reste l'autorité sur le score).
- Page hors-ligne dédiée listant les contenus disponibles localement.
- Budget performance : page leçon < 200 Ko de JS, images optimisées (next/image, AVIF/WebP), Lighthouse Performance ≥ 85 sur mobile simulé 3G.
- Installation PWA (manifest, icônes, invite d'installation contextuelle).

**Tests unitaires**
- Logique de file de synchronisation : ordre préservé, doublons éliminés, conflits résolus côté serveur.
- Sélecteur de cache : une leçon téléchargée est marquée disponible hors-ligne, ses images incluses.

**Tests e2e**
- Playwright en mode offline : ouvrir une leçon téléchargée sans réseau ⇒ elle s'affiche ; une leçon non téléchargée ⇒ page hors-ligne explicative.
- Répondre à un quiz hors-ligne → repasser online ⇒ la tentative est synchronisée et visible dans l'historique.

**Validation** : test réel sur un téléphone Android d'entrée de gamme en coupant les données.

---

### Phase 12 — Assistant IA pédagogique

**Objectif** : un tuteur qui explique autrement quand l'élève bloque — avec des garde-fous stricts.

**Tâches**
- Intégration API Claude côté serveur uniquement (jamais de clé côté client).
- Contexte injecté : la leçon en cours + le programme du niveau ; l'assistant reformule, donne des exemples, pose des questions socratiques — il ne fait pas les devoirs à la place de l'élève (prompt système versionné dans le repo).
- Déclenchement après un quiz raté : « Veux-tu que je t'explique ce chapitre autrement ? » + suggestion des sections à revoir.
- Quotas : N questions/jour en gratuit, plus en premium ; réponses en streaming.
- Journalisation anonymisée des échanges pour amélioration (opt-out possible).

**Tests unitaires**
- Constructeur de contexte : la bonne leçon et le bon niveau sont injectés ; troncature propre si trop long.
- Compteur de quota : décrément, reset quotidien (Africa/Dakar), différence gratuit/premium.
- Le client API est mocké : gestion des erreurs (timeout, 429) ⇒ message français gracieux.

**Tests e2e**
- Élève rate un quiz → l'invite d'aide apparaît → il pose une question → une réponse en streaming s'affiche (backend mocké en e2e).
- Quota atteint ⇒ message d'invitation premium, pas d'appel API.

**Validation** : revue manuelle de 10 conversations de test (ton, refus de faire les devoirs, exactitude).

---

### Phase 13 — Recherche, sécurité, monitoring et mise en production

**Objectif** : durcir et livrer.

**Tâches**
- Recherche full-text (PostgreSQL `tsvector`, dictionnaire français) sur leçons et sujets de forum, avec autocomplétion.
- Durcissement : en-têtes de sécurité (CSP, HSTS), audit des dépendances en CI, sauvegardes PostgreSQL quotidiennes testées (restauration vérifiée), journaux d'audit des actions admin.
- Monitoring : Sentry (front + API), métriques de base (latence, erreurs), alerte si `/health` échoue.
- Déploiement : Dockerfiles de prod multi-stage, Compose de prod (Traefik + certificats), script de déploiement zéro-interruption, migrations automatiques au déploiement.
- Pages légales : CGU, politique de confidentialité (données de mineurs), mentions légales.

**Tests unitaires**
- Normalisation de la recherche : accents, pluriels français (« cellule » trouve « cellules »).
- Journal d'audit : chaque action admin sensible écrit une entrée complète.

**Tests e2e**
- Recherche « photosynthèse » ⇒ la leçon correspondante ressort en premier.
- Smoke test de prod (staging) : inscription, connexion, ouverture d'une leçon, passage d'un quiz — le tout en < 2 min.

**Validation finale** : checklist de mise en production dans `docs/go-live.md`, revue de sécurité complète, test de restauration de sauvegarde réussi.

---

## 5. Récapitulatif des commandes

```bash
pnpm dev          # lance web + api en dev
pnpm lint         # eslint sur tout le monorepo
pnpm typecheck    # tsc --noEmit partout
pnpm test         # tests unitaires (vitest)
pnpm test:cov     # avec couverture
pnpm e2e          # playwright (démarre les apps en mode test)
pnpm seed         # peuple la base de démo
docker compose up # postgres, redis, minio, mailhog
```

## 6. Variables d'environnement (`.env.example` à maintenir)

```
DATABASE_URL=            # PostgreSQL
REDIS_URL=
S3_ENDPOINT= S3_BUCKET= S3_ACCESS_KEY= S3_SECRET_KEY=
JWT_SECRET= JWT_REFRESH_SECRET=
SMTP_HOST= SMTP_PORT=    # mailhog en dev
ANTHROPIC_API_KEY=       # phase 12, serveur uniquement
WAVE_API_KEY= WAVE_WEBHOOK_SECRET=      # phase 10
OM_API_KEY= OM_WEBHOOK_SECRET=          # phase 10
NOTIF_PROVIDER=mock      # mock | whatsapp | sms
APP_URL= API_URL=
```

## 7. Ce qui est explicitement hors périmètre v2.0

Visioconférence en direct, application mobile native, élémentaire et lycée (prévus v2.x),
génération automatique de contenus par IA sans validation humaine.

---

*Document de référence : mémoire de Master « Conception et implémentation d'une plateforme
E-learning pour les élèves du collège » (UVS, 2022) — Doudou COLY.*
