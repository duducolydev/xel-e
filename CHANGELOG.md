# Changelog

Résumé par phase, conforme à la Definition of Done (`DOCS/BRIEF_SEENS_V2.md`, section 3).

---

## Phase 0 — Bootstrap du monorepo et CI

**Fait** :
- Monorepo pnpm workspaces + Turborepo (`apps/web`, `apps/api`, `packages/shared`, `packages/config`).
- `apps/web` : Next.js 15 (App Router), TypeScript, Tailwind CSS v4 — page d'accueil affichant le nom
  de la plateforme.
- `apps/api` : NestJS, TypeScript — module `health` (`GET /health`) qui vérifie la connectivité
  PostgreSQL (`pg`) et Redis (`ioredis`) et renvoie `{ status, database, redis }`.
- `packages/shared` : constantes `NIVEAUX`/`MATIERES` et schéma zod `healthResponseSchema` partagés
  entre le front, l'API et les tests.
- `packages/config` : `tsconfig.base.json` et config ESLint flat partagée.
- `docker-compose.yml` : postgres, redis, minio, mailhog, tous avec healthcheck.
- CI GitHub Actions (`.github/workflows/ci.yml`) : install → lint → typecheck → tests unitaires
  (avec couverture) → tests e2e (Postgres/Redis en service containers) → build.
- `.env.example` tenu à jour avec toutes les variables listées dans le brief.

**Décisions** : voir `DOCS/decisions.md` (D0001, D0002) — dossier de documentation unique `DOCS/`,
pas de sous-dossier `seens/` à la racine.

**Tests** :
- Unitaires : `HealthService` — ok si BD et Redis répondent, degraded sinon, sur les 4 combinaisons
  (mocks des pingers).
- Unitaires : `healthResponseSchema` (validation zod).
- e2e : Supertest `GET /health` → 200 avec un payload conforme au schéma.
- e2e : Playwright — la page d'accueil se charge et affiche « Xel-E ».

**Dette éventuelle** :
- Le health-check BD utilise un `pg.Pool` brut plutôt que Prisma (le schéma Prisma n'existe pas
  encore) ; à revoir à la Phase 1 une fois le client Prisma disponible, si un indicateur de santé
  basé sur Prisma est préférable.
- Pas encore de suite de tests unitaires côté `apps/web` (aucune logique front à tester en Phase 0) ;
  l'outillage Vitest y sera ajouté dès qu'un composant testable apparaît.

---

## Phase 1 — Schéma de base de données et seed

**Fait** :
- Schéma Prisma complet (`apps/api/prisma/schema.prisma`) : les 17 modèles du brief (`User`,
  `ParentLink`, `Niveau`, `Matiere`, `Chapitre`, `Lecon`, `Quiz`, `Question`, `Tentative`,
  `Progression`, `Badge`, `BadgeUtilisateur`, `SujetForum`, `Message`, `Signalement`, `Abonnement`,
  `Paiement`, `Notification`), avec unicité email/pseudonyme/identifiant, index sur les FK
  fréquentes, et `deletedAt` (suppression douce) sur `User` et les contenus (`Chapitre`, `Lecon`,
  `SujetForum`, `Message`).
- Migration initiale `20260828155519_init` appliquée, avec `down.sql` écrit à la main (Prisma ne
  génère pas de rollback automatique) et script `pnpm db:migrate:down` pour l'exécuter.
- `HealthService` bascule du `pg.Pool` brut vers `PrismaService` (dette notée en Phase 0) : un seul
  point d'accès BD dans l'API.
- Script `pnpm seed` idempotent (upserts) : 4 niveaux × 3 matières, 2 chapitres/matière,
  3 leçons/chapitre, 1 quiz/leçon, 4 comptes de démo (élève, prof, parent, admin). Câblé sur
  `prisma migrate reset` via la clé `"prisma".seed` du `package.json`.
- `packages/shared` : schémas zod `emailSchema`/`passwordSchema` et énumérations
  `roleSchema`/`statutLeconSchema`/`typeQuestionSchema` (miroir des enums Prisma, sans dépendre de
  `@prisma/client` pour rester utilisables côté front).
- ERD généré via `prisma-erd-generator` → `DOCS/erd_prisma.svg`, disponible à la demande via
  `pnpm --filter @xel-e/api docs:erd` (séparé du `generate` rapide utilisé par CI/dev pour ne pas
  payer le coût du rendu Chromium à chaque build).
- `turbo.json` : nouvelle tâche `generate` (dépendance de build/dev/test/lint/typecheck/e2e/seed) et
  `globalEnv` déclarant les variables d'environnement du projet, sans quoi Turbo les filtrait en
  mode strict.

**Décisions** : voir `DOCS/decisions.md` (D0004, D0005) — `127.0.0.1` plutôt que `localhost` pour les
services Docker en local (le handshake ioredis et `prisma migrate dev` restaient bloqués sur
`localhost`), et port de dev `apps/web` déplacé sur `3010` (conflit local avec un autre projet sur
`3000`).

**Tests** :
- Unitaires : `emailSchema`/`passwordSchema` (normalisation, règles de format) et les trois
  énumérations zod, dans `packages/shared`.
- Unitaires : `seedAll` avec un client Prisma mocké — comptages exacts et idempotence (relancer le
  seed ne duplique rien), 100 % de couverture sur `prisma/seed.ts`.
- e2e : reset + seed contre une vraie base → comptages exacts (niveaux, matières, chapitres, leçons,
  quiz, comptes) et non-duplication au second passage.
- e2e : migration up → down (reset complet du schéma `public`) → up de nouveau, sans erreur, base
  vide et migrée à la fin.

**Validation** : `pnpm db:migrate:reset` peuple la base avec les comptes de démo et les comptages
attendus (vérifié directement en base) ; `GET /health` renvoie `{"status":"ok","database":true,
"redis":true}` sur le build de production.

**Dette éventuelle** :
- Les mots de passe des comptes de démo sont un hash placeholder (`PLACEHOLDER_PASSWORD_HASH`) — le
  hachage argon2 réel arrive avec l'inscription/connexion en Phase 2.

---

## Phase 2 — Authentification, rôles et conformité mineurs

**Fait** :
- Migration `20260926133934_auth` (réversible, `down.sql` testé) : statut de compte, confirmation
  d'email, mois/année de naissance, contact et accord parental sur `User` ; tables `RefreshToken`
  (familles pour la rotation) et `JetonVerification` (confirmation d'email, reset, accord parental).
- Inscription élève (email **ou** identifiant, classe, mois/année de naissance), professeur (en
  attente de validation admin) et parent. Élève de moins de 15 ans : email d'un parent obligatoire,
  demande d'accord envoyée par email, forum fermé tant que l'accord n'est pas donné.
- Connexion par email ou identifiant, hash **argon2id** (`@node-rs/argon2`), JWT d'accès 15 min et
  refresh token rotatif 30 jours, tous deux en cookies `httpOnly` ; déconnexion ; mot de passe
  oublié / réinitialisation par email (lien 1 h, toutes les sessions coupées après changement).
- Guards globaux : tout est protégé par défaut, `@Public()` pour ouvrir, `@Roles(...)` pour
  restreindre, `@CurrentUser()` pour l'utilisateur courant. Endpoints admin de validation des profs.
- Rate limiting Redis : 5 échecs de connexion par (IP, identifiant) puis 429 ; limites par IP larges
  sur les autres routes d'auth.
- Emails (SMTP, mailhog en dev) : confirmation, accord parental, réinitialisation, compte prof validé.
- Config de l'API validée par zod au démarrage (l'API refuse de démarrer sans `JWT_SECRET`, etc.).
- Front : proxy `/api` → API, middleware de rafraîchissement transparent de la session, pages
  inscription, connexion, mot de passe oublié/réinitialisation, confirmation d'email, accord
  parental, tableau de bord et administration ; erreurs en français, champ par champ.
- Seed : les comptes de démo ont un vrai mot de passe (`XeleDemo2026`, **dev uniquement**) et un
  email confirmé ; relancer `pnpm seed` suffit à mettre à jour une base existante.
- `DOCS/acces.md` : matrice rôle × ressource, rejouée par les tests.

**Décisions** : `DOCS/decisions.md` D0006 à D0009 — règles des mineurs (validées), sessions en cookies
derrière le proxy Next, rotation avec détection de réutilisation, rate limiting.

**Tests** :
- Unitaires (API) : hash/vérification argon2 ; émission, rotation, détection de réutilisation et
  invalidation des refresh tokens ; `AuthService` (inscription mineurs/majeurs, connexion, prof en
  attente, reset vers l'élève ou le parent) ; guards sur des routes factices (401/403/200) ; règle
  mineur `accesForum` ; jetons de vérification (usage unique, expiration, type) ; limiteur.
- Unitaires (shared) : calcul d'âge au mois près.
- e2e API (Supertest, vraie base + mailhog) : parcours élève avec email de confirmation, élève de
  moins de 15 ans avec accord parental, prof validé par l'admin, rotation et déconnexion, reset,
  6 échecs ⇒ 429, matrice d'accès complète, réversibilité de la dernière migration (instantané du
  schéma avant/après).
- e2e Playwright : inscription → email (mailhog) → confirmation → connexion → tableau de bord ;
  élève refusé sur `/admin` (403 API + redirection) ; session qui continue après expiration de
  l'accès (rotation observée) ; déconnexion ; champ parent affiché sous 15 ans.

**Dette éventuelle** :
- Pas de renvoi de l'email de confirmation ou de la demande d'accord parental depuis l'interface
  (si l'email s'est perdu, il faut pour l'instant passer par l'administration).
- Pas encore d'interface pour qu'un admin réinitialise le mot de passe d'un élève sans email.
- Importer `@xel-e/shared` côté client embarque zod dans la page d'inscription (~15 Ko gzip) ; à
  surveiller avec le budget performance de la Phase 11.

---

## Phase 3 — Contenus pédagogiques (lecture)

**Fait** :
- Migration `20260926144107_contenus` (réversible, `down.sql` testé) : `slug` des leçons (rempli
  pour les leçons existantes avant d'être rendu obligatoire), table `VersionLecon` et pointeur vers
  la version en ligne ; un trigger PostgreSQL interdit toute modification d'une version publiée.
- Circuit de publication (API admin) : chapitres et leçons (création, édition, suppression
  douce), brouillon → en revue → publiée, renvoi en brouillon ; publier fige une nouvelle version,
  modifier une leçon publiée ne touche pas la version en ligne jusqu'à la suivante. Aperçu du rendu
  d'un brouillon pour l'admin.
- Rendu Markdown côté API, calculé une fois à la publication : sections découpées sur les titres
  `##`, formules KaTeX, liste blanche HTML stricte, images limitées à nos médias.
- Lecture publique (sans compte) : catalogue par niveau/matière, leçon publiée avec voisines,
  plan du site. Les brouillons renvoient 404 partout, y compris au front.
- Médias : téléversement d'images par l'admin (PNG, JPEG, GIF, WebP, 2 Mo max ; type vérifié sur
  les octets, SVG refusé), stockage S3/MinIO, nom = empreinte SHA-256, cache navigateur permanent.
- PDF d'une leçon : rendu par Chromium à partir d'un gabarit autonome (formules et images
  intégrées), généré au premier téléchargement puis mis en cache par version.
- Front : `/cours` → niveau → matière (chapitres) → leçon paginée par sections (`?section=N`), fil
  d'Ariane, sommaire, bouton PDF ; métadonnées OpenGraph, URL canonique, données structurées
  (`BreadcrumbList`, `LearningResource`), `sitemap.xml`, `robots.txt`, page 404 en français. Le
  tableau de bord mène l'élève directement aux cours de sa classe.
- Seed : les 72 leçons de démo sont publiées ; une vraie leçon de démonstration (« Le théorème de
  Pythagore », 4e) avec sections, formules et tableau.
- CI : MinIO démarré pour le job e2e.

**Décisions** : `DOCS/decisions.md` D0010 à D0013 — Markdown assaini plutôt que MDX (qui
exécuterait du code venu de la base), versions immuables, leçons publiées publiques et pagination
par sections, PDF par Chromium mis en cache par version.

**Tests** :
- Unitaires : conversion Markdown → HTML face à 15 charges XSS (vérifiées en analysant le HTML
  produit, avec un contrôle que le détecteur repère bien une vraie faille) ; découpage en sections ;
  machine à états (seule une leçon EN_REVUE passe PUBLIE) ; publication qui crée une version figée
  et laisse l'ancienne intacte, y compris sous publication concurrente ; politique d'accès
  (brouillons invisibles hors admin) ; catalogue ; export PDF (cache, images, échappement) ; médias.
- e2e API : circuit complet création → 404 en brouillon → publication → visible → modification
  sans effet avant republication → version 2 ; immuabilité vérifiée contre la vraie base ; PDF
  valide (`application/pdf`, `%PDF-`, taille > 0) ; médias ; matrice d'accès étendue à 55 cas.
- e2e Playwright : un admin publie une leçon → l'élève la trouve depuis son tableau de bord, l'ouvre
  et la pagine ; téléchargement du PDF ; brouillon ⇒ 404 ; métadonnées SEO et sitemap.

**Validation** : Lighthouse sur le build de production (mobile) — page leçon, page matière et
catalogue : SEO 100, accessibilité 100, bonnes pratiques 100, performance 96–97.

**Dette éventuelle** :
- Pas encore d'interface d'édition des contenus : l'admin passe par l'API (le studio d'édition est
  l'objet de la Phase 6).
- Les pages de cours sont rendues à chaque requête (`force-dynamic`) ; une mise en cache avec
  invalidation à la publication sera à étudier avec le budget performance de la Phase 11.
- L'image Docker de production de l'API devra embarquer Chromium pour les PDF (Phase 13).
- Une base de développement existante garde des slugs `lecon-<id>` pour les leçons de démo :
  `pnpm --filter @xel-e/api db:migrate:reset` la remet à neuf avec les slugs lisibles.

---

## Phase 4 — Moteur de quiz et correction automatique

**Fait** :
- Migration `20260926151151_quiz` (réversible, `down.sql` testé) : explication par question ;
  position de reprise, corrigé figé, points et verrou « une seule tentative en cours » par élève et
  par quiz sur `Tentative`.
- Types de questions : QCM à une ou plusieurs bonnes réponses, vrai/faux, réponse courte (casse,
  accents, espaces, ponctuation finale et virgule décimale tolérés). Barème par question.
- Déroulé : démarrage ou reprise d'une tentative, réponses enregistrées au fil de l'eau (et
  position à chaque navigation), soumission finale, **correction côté serveur uniquement**, corrigé
  détaillé par question (réponse donnée, bonne réponse, points, explication) figé dans la tentative.
- Anti-triche : le quiz envoyé au navigateur est construit par liste blanche de champs, sans bonne
  réponse ni explication ; les réponses mal formées sont refusées ; une tentative soumise n'accepte
  plus rien ; la tentative d'un autre élève renvoie 404.
- Front : quiz une question par écran, contrôles natifs (utilisable au clavier), focus déplacé sur
  l'énoncé à chaque question, état d'enregistrement annoncé, confirmation s'il reste des questions
  sans réponse ; écran de résultat avec score et corrigé ; page « Mes quiz » (historique, reprise
  d'une tentative en cours) ; accès au quiz depuis la leçon et le tableau de bord.
- Seed : le quiz « Le théorème de Pythagore » contient un exemple de chaque type de question (dont
  un QCM à plusieurs réponses) pour la revue manuelle ; trois questions génériques pour les autres
  leçons de démo.
- Correctif de la Phase 3 (commit séparé sur sa branche) : typage d'un test qui faisait échouer
  `pnpm typecheck`.

**Décisions** : `DOCS/decisions.md` D0014 — QCM multiple noté proportionnellement avec pénalité
(choix validé), normalisation des réponses courtes, tentatives illimitées avec une seule en cours,
pas de minuteur avant la Phase 9.

**Tests** :
- Unitaires : notation (cas nominaux, aucune réponse, QCM multiple partiel, « Photosynthèse » =
  « photosynthese », virgule décimale, arrondis) ; payload public sans aucun champ de correction, y
  compris quand la base contient un choix mal formé ; reprise de tentative avec réponses conservées ;
  validation des réponses ; soumission figée ; nouvelle tentative vierge ; cloisonnement entre élèves.
- e2e API : quiz réel de démonstration de bout en bout (6/7 points = 85,7 %, statuts attendus),
  reprise, 400 sur réponse mal formée, 409 après soumission, 404 pour un autre compte, historique ;
  matrice d'accès étendue à 70 cas.
- e2e Playwright : parcours élève complet (dont une réponse au clavier) jusqu'au score, au corrigé et
  à l'historique ; onglet fermé en plein quiz puis rouvert ⇒ reprise à la même question avec les
  réponses ; aucune bonne réponse dans le HTML de la page du quiz.

**Validation** : revue visuelle du quiz de démonstration (questions, confirmation de fin, corrigé)
sur mobile ; elle a fait corriger un énoncé qui répétait l'indication « plusieurs réponses » et la
mise en page du corrigé sur petit écran. **Reste à faire** : relecture pédagogique du quiz « Le
théorème de Pythagore » (4e, Maths) par le porteur du projet (fond des questions et explications).

**Dette éventuelle** :
- Pas encore d'interface ni d'API pour rédiger des quiz : ils viennent du seed ; le générateur de
  quiz est prévu dans le studio professeur (Phase 6).
- Les réponses saisies hors connexion ne sont pas mises en file : c'est l'objet de la Phase 11.

---

## Phase 5 — Progression et gamification

**Fait** :
- Migration `20260926221201_progression` (réversible, `down.sql` testé) : registre `GainXp` (unicité
  élève + source + clé), leçon terminée / quiz réussi / meilleur score sur `Progression` (les
  colonnes `pourcentage` et `xp`, jamais utilisées, sont remplacées par le registre), série de jours
  actifs et participation au classement sur `User`, XP rapportée par chaque tentative de quiz.
- Événements de progression : bouton « J'ai terminé cette leçon » (dernière section), soumission
  de quiz (réussi à partir de 60 %). XP : +10 leçon, +20 quiz réussi, +10 sans-faute, chacun une
  seule fois par leçon ou quiz.
- Série de jours actifs en heure de Dakar (leçon terminée ou quiz soumis) ; badges (Première
  leçon, Premier quiz réussi, Sans faute, Chapitre bouclé, Sept jours de suite, Lecteur assidu),
  chacun notifié une seule fois dans l'application.
- Tableau de bord élève : XP totale et de la semaine, série et record, notifications (avec « Tout
  marquer comme lu »), avancement par matière et par chapitre, badges obtenus et à débloquer,
  dernières activités. XP gagnée affichée sur le résultat d'un quiz.
- Classement hebdomadaire par niveau, sur demande et sous pseudonyme choisi, retrait possible.
- Seed de démonstration (`pnpm seed` uniquement) produit par les vrais services : l'élève de démo a
  terminé trois leçons sur trois jours (série de 3), réussi un quiz à 100 % (60 XP), et deux
  camarades de démo peuplent le classement.

**Décisions** : `DOCS/decisions.md` D0015 — les quatre choix validés (leçon terminée par bouton,
jour actif = leçon terminée ou quiz soumis, classement sur demande sous pseudonyme, XP de la
semaine) et les règles d'XP, de badges et d'avancement.

**Tests** :
- Unitaires : chaque règle de badge isolément (au seuil et juste en dessous), catalogue entièrement
  couvert ; idempotence (terminer deux fois, refaire un quiz, attribution concurrente d'un badge)
  sans double XP, double badge ni double notification ; série (fuseau Africa/Dakar comparé à
  Europe/Paris, jour manqué ⇒ remise à zéro, même jour ⇒ pas d'incrément, fin de mois) ; début de
  semaine ; agrégat de chapitre = f(leçons terminées, quiz réussis) ; classement avec ex æquo ;
  tableau de bord et réglages du classement.
- e2e API : parcours d'un nouvel élève jusqu'à 40 XP, 3 badges et 3 notifications ; recoupement de
  chaque chiffre du tableau de bord avec la base, pour cet élève et pour le compte de démo ;
  classement (activation, pseudonyme invalide ou pris, réservé aux élèves, retrait) ; matrice
  d'accès étendue à 85 cas.
- e2e Playwright : leçon terminée + quiz réussi ⇒ le tableau de bord affiche 40 XP, la série, les
  badges et l'avancement, atteint par les liens de l'interface sans recharger la page ; badge
  « Première leçon » avec sa notification in-app ; participation au classement puis retrait.

**Validation** : chiffres du tableau de bord recoupés avec la base par un test automatisé (élève
neuf et compte de démo) ; revue visuelle sur mobile du tableau de bord et du classement.

**Correctif trouvé en route** : l'attribution d'un badge échouait (erreur 500) si la table des
badges avait été vidée après le démarrage de l'API ; elle recrée désormais le badge à partir du
catalogue du code (test unitaire dédié).

**Dette éventuelle** :
- Si l'enregistrement de la progression échoue après une soumission de quiz, l'incident est
  journalisé mais pas rejoué automatiquement (à reprendre avec la file de jobs BullMQ, Phase 8).
- Les notifications ne sont visibles que sur le tableau de bord (pas encore d'indicateur dans
  l'en-tête des autres pages).

---

## Phase 6 — Studio professeur et circuit de validation

**Fait** :
- Migration `20260926225430_studio` (réversible, `down.sql` testé) : commentaires de revue
  (`CommentaireRevue`), date de soumission, quiz de travail et compteur de vues sur `Lecon`.
- Machine à états **par rôle** : le professeur rédige et soumet ses leçons, seule l'administration
  publie ou refuse ; une leçon en revue est verrouillée. Le refus exige un commentaire, conservé
  avec la leçon (remplace l'ancien « renvoyer en brouillon » sans motif).
- Espace professeur `/studio` : ses leçons et leur statut (avec le dernier refus à corriger),
  création dans un chapitre existant, notifications, statistiques de ses leçons en ligne (vues,
  quiz passés, taux de réussite, score moyen, et totaux).
- Éditeur de leçon : Markdown avec aperçu (rendu identique à la publication, formules KaTeX),
  insertion d'images, générateur de quiz (QCM à une ou plusieurs bonnes réponses, vrai/faux,
  réponse courte ; barème, explication, ordre), enregistrement, soumission, suppression d'un
  brouillon jamais publié. Le quiz est relu avec la leçon et mis en ligne avec elle.
- File de revue `/admin/revue` : leçons en attente (plus ancienne d'abord), relecture du cours
  rendu et du quiz corrigé, puis « Valider et publier » ou « Refuser » avec commentaire.
- Notifications in-app : l'auteur à chaque changement de statut décidé par un autre, les
  administrateurs à chaque soumission (module `notifications` réutilisable).
- Attribution « Cours proposé par Pr X » sur les leçons des professeurs ; compteur de vues
  (un visiteur par heure, empreinte hachée dans Redis).
- Liens « Studio » dans l'en-tête (professeurs, admins) et depuis le tableau de bord professeur.

**Décisions** : `DOCS/decisions.md` D0016 — leçons seulement, dans les chapitres existants (choix du
porteur du projet) ; droits par rôle ; quiz de travail appliqué à la publication ; définitions des
vues et du taux de réussite ; attribution réservée aux professeurs. `DOCS/acces.md` mis à jour.

**Tests** :
- Unitaires (313 au total côté API) : machine à états (transitions autorisées et interdites) et
  droits par rôle — un professeur ne peut ni publier ni refuser (403), ne touche qu'à ses leçons
  (404 pour les autres), une leçon en revue est verrouillée pour tous ; circuit complet du service
  de publication (refus commenté + notification, publication + notification, pas de notification
  de sa propre action, quiz appliqué seulement à la publication, questions conservées/créées/
  supprimées, quiz vidé retiré, quiz invalide refusé, concurrence) ; conversion quiz en ligne ⇄
  éditeur sans perte (même correction avant et après) ; agrégats de statistiques sur données
  synthétiques (pondération, absence de tentatives, arrondis, tri) ; compteur de vues
  (dédoublonnage, IP jamais en clair, Redis indisponible) ; notifications ; attribution.
- e2e API (198 au total) : circuit complet prof crée leçon + quiz → soumet → file de revue admin →
  refus commenté → le prof voit commentaire et notification, corrige, resoumet → l'admin publie →
  l'élève lit la leçon attribuée et fait le quiz → vues et taux de réussite remontent au prof ;
  cloisonnement entre professeurs ; matrice d'accès étendue à 125 cas.
- e2e Playwright (20 au total) : le même circuit de bout en bout dans le navigateur, avec trois
  sessions (prof, admin, élève), aperçu KaTeX, refus sans commentaire rejeté, et la vue de l'élève
  visible dans les statistiques du prof ; un élève n'accède pas au studio.

**Correctif trouvé en route** : le test unitaire du seed (purement CPU : argon2id et rendu KaTeX de
72 leçons, parfois deux fois) dépassait le délai par défaut de 5 s sur une machine chargée ; délai
porté à 30 s pour ce seul bloc.

**Dette éventuelle** :
- Le compteur de vues repose sur l'IP + navigateur : des élèves d'une même classe derrière une
  seule IP et le même navigateur comptent pour une vue par heure (sous-estimation assumée).
- Pas d'éditeur WYSIWYG ni d'enregistrement automatique : le professeur enregistre à la main (un
  indicateur signale les modifications non enregistrées).
- Les notifications n'ont pas de lien direct vers la leçon concernée ; pas encore d'envoi par
  email (Phase 8, avec BullMQ).
- Observé une fois pendant la validation : dans la suite Playwright complète, le test « terminer une
  leçon + réussir son quiz » a été renvoyé vers la connexion en plein quiz (session perdue avec le
  TTL d'accès de 20 s des e2e) ; il repasse seul (3/3) et le reste de la suite est vert (19/20).
  Cause non identifiée, code d'authentification non modifié en Phase 6 : à surveiller en CI.
