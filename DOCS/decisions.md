# Journal des décisions

Ce document consigne les décisions prises face à une ambiguïté fonctionnelle ou technique
du brief (`DOCS/BRIEF_SEENS_V2.md`), conformément à la règle 7 de la section 3.

---

## D0001 — Emplacement du dossier de documentation

**Contexte** : le brief référence un dossier `docs/` (minuscule) pour `decisions.md`, `acces.md`,
`moderation.md`, `go-live.md`. Le dépôt contient déjà `DOCS/` (majuscule) avec le brief et les
diagrammes d'architecture. Sur un système de fichiers insensible à la casse (Windows/macOS par
défaut), `docs/` et `DOCS/` désignent le même dossier — les créer séparément casserait le dépôt
sur ces environnements et prêterait à confusion sur Linux (CI, prod).

**Décision** : un seul dossier `DOCS/` (majuscule) sert de documentation du projet, y compris pour
tous les fichiers listés dans le brief (`decisions.md`, `acces.md`, `moderation.md`, `go-live.md`).

**Date** : 2026-08-28 — Phase 0.

---

## D0002 — Nom du dossier racine du monorepo

**Contexte** : le brief illustre la structure du dépôt sous un dossier racine nommé `seens/`
(nom de code interne / mémoire). Le dépôt réel est `Xel-E`.

**Décision** : la racine du monorepo est directement la racine du dépôt (`Xel-E/`), sans dossier
`seens/` intermédiaire. La structure interne (`apps/`, `packages/`, `e2e/`, etc.) suit le brief
à l'identique.

**Date** : 2026-08-28 — Phase 0.

---

## D0003 — Port hôte PostgreSQL du docker-compose

**Contexte** : lors de la validation de la Phase 0, `GET /health` renvoyait `database: false` malgré
un conteneur `postgres` sain. Diagnostic : un PostgreSQL natif Windows préexistant sur la machine de
développement écoutait déjà sur le port hôte `5432`, absorbant les connexions destinées au conteneur
Docker (`pg_hba.conf` de ce service natif refusant l'utilisateur `xele`). Ce conflit est local à
l'environnement de dev, pas au projet, et le service natif ne doit pas être touché.

**Décision** : le port hôte exposé par le service `postgres` du `docker-compose.yml` est `5433`
(au lieu de `5432`), aussi bien en local qu'en CI (service container GitHub Actions). Le port interne
au conteneur reste `5432`. `DATABASE_URL` dans `.env.example` et `.github/workflows/ci.yml` utilise
donc le port `5433`. Sur une machine sans conflit de port, il suffit d'adapter `DATABASE_URL`
localement si l'on préfère `5432` — le choix `5433` n'est pas une contrainte du projet, seulement le
défaut le plus sûr pour éviter un faux `degraded` silencieux.

**Date** : 2026-08-28 — Phase 0.

---

## D0004 — `127.0.0.1` plutôt que `localhost` pour les services Docker Compose (local)

**Contexte** : en Phase 1, la connexion Redis (ioredis) via `redis://localhost:6379` établissait bien
la connexion TCP mais restait bloquée indéfiniment avant l'événement `ready` (le handshake interne
d'ioredis n'aboutissait jamais) ; `prisma migrate dev` échouait aussi par intermittence sur
`localhost:5433` avec `P1001: Can't reach database server`. Dans les deux cas, remplacer `localhost`
par `127.0.0.1` dans la chaîne de connexion résout le problème instantanément. Cause probable :
résolution `localhost` → IPv6 (`::1`) en priorité sur cette machine, vers un relai Docker Desktop qui
gère mal les échanges multi-étapes (fonctionne pour une requête simple, bloque sur un handshake).
Un `curl`/`SELECT 1` isolé passait déjà par `localhost` sans problème, ce qui a rendu le diagnostic
non trivial.

**Décision** : `DATABASE_URL`, `REDIS_URL` et `S3_ENDPOINT` dans `.env.example` utilisent `127.0.0.1`
plutôt que `localhost`. `APP_URL`/`API_URL` (côté navigateur/PWA) restent en `localhost`, non concernés
par ce problème et plus conventionnels pour les cookies/CORS côté client. CI (runners Linux, sans
Docker Desktop) n'est pas concerné et garde `localhost`.

**Date** : 2026-08-28 — Phase 1.

---

## D0005 — Port de dev `apps/web` déplacé sur 3010

**Contexte** : le port 3000 (par défaut Next.js) est déjà occupé en permanence sur cette machine de
développement par le conteneur Docker `sigark-api` d'un autre projet, sans lien avec Xel-E.

**Décision** : `apps/web` tourne en dev sur le port `3010` (`next dev -p 3010`), et
`playwright.config.ts` cible ce même port. Purement une question d'environnement local — sur une
machine sans conflit, `3000` conviendrait aussi bien.

**Date** : 2026-08-28 — Phase 1.

---

## D0006 — Règles d'inscription et de conformité des mineurs

**Contexte** : le brief (Phase 2) laissait plusieurs points ouverts. Tranchés par le porteur du
projet le 2026-09-26.

**Décisions** :

1. **Âge** : l'élève renseigne son **mois et son année** de naissance (pas le jour). Sans le jour,
   l'anniversaire n'est compté qu'une fois le mois de naissance passé : l'âge n'est jamais
   surestimé. L'âge est recalculé à chaque requête, donc un élève qui atteint 15 ans n'a plus besoin
   d'accord parental sans action de sa part. Un élève dont l'âge est inconnu est traité comme ayant
   moins de 15 ans. Âge minimum d'inscription : 8 ans (garde-fou contre les erreurs de saisie).
2. **Confirmation d'email non bloquante** : la connexion et les cours sont accessibles tout de
   suite ; le **forum** reste fermé tant que l'email n'est pas confirmé (cohérent avec « il faut un
   compte confirmé pour poster », Phase 7) et, pour les moins de 15 ans, tant que le parent n'a pas
   donné son accord.
3. **Professeur non validé** : connexion refusée (403, message explicite) jusqu'à validation par
   un admin (`POST /admin/professeurs/:id/valider`, qui envoie un email au professeur).
4. **Mot de passe oublié sans email** : le lien part vers l'email du parent s'il est connu (cas des
   moins de 15 ans), sinon l'élève doit passer par son professeur ou l'administration. La réponse de
   l'API est identique dans tous les cas (pas d'énumération des comptes).

Minimisation : l'email du parent n'est conservé que s'il est requis (moins de 15 ans) ; il est ignoré
sinon.

**Date** : 2026-09-26 — Phase 2.

---

## D0007 — Sessions : cookies httpOnly derrière le proxy Next.js

**Contexte** : le brief impose un refresh token rotatif en cookie httpOnly, sans préciser où vit le
JWT d'accès, ni comment le front (Next.js, rendu serveur) et l'API (autre port / sous-domaine)
partagent la session.

**Décision** :
- Le navigateur ne parle qu'au front : `next.config.ts` réécrit `/api/*` vers l'API. Les cookies
  sont donc first-party, sans CORS ni `SameSite=None`.
- Le JWT d'accès **et** le refresh token sont tous deux en cookies `httpOnly`, `SameSite=Lax`,
  `Secure` en production. Aucun jeton n'est lisible en JavaScript (pas de `localStorage`).
- Le middleware Next.js renouvelle la session avant le rendu des pages protégées quand le cookie
  d'accès a disparu ; `envoyer()` côté client rejoue une fois une requête après un 401.
- Le cookie d'accès expire un peu avant le JWT (30 s en production) : le rafraîchissement a lieu
  pendant que le JWT est encore valide, jamais au milieu d'un rendu.
- CSRF : couvert par `SameSite=Lax` et une API qui n'accepte que du JSON en `POST`.

**Date** : 2026-09-26 — Phase 2.

---

## D0008 — Rotation des refresh tokens et détection de réutilisation

**Décision** : chaque rafraîchissement révoque le jeton présenté et en émet un nouveau dans la même
« famille ». Présenter un jeton déjà remplacé révoque **toute la famille** (vol probable), sauf dans
les 30 secondes suivant sa rotation **et** si la famille est toujours active : deux onglets ou deux
requêtes parallèles présentent légitimement le même jeton. Un jeton révoqué par déconnexion ou par
changement de mot de passe n'est jamais accepté, même dans cette fenêtre. Les jetons (refresh et
liens email) sont stockés hachés en HMAC-SHA256 avec `JWT_REFRESH_SECRET`.

**Date** : 2026-09-26 — Phase 2.

---

## D0009 — Rate limiting : échecs de connexion stricts, limites par IP larges

**Décision** :
- Connexion : 5 échecs par couple (IP, identifiant) sur 15 min ; la 6e tentative reçoit un 429, même
  avec le bon mot de passe. Une connexion réussie remet le compteur à zéro.
- Limites par IP sur les autres routes d'authentification (inscription 50/h, mot de passe oublié
  20/15 min, connexion 100/15 min) volontairement **larges** : dans un établissement, toute une
  classe peut sortir par une seule IP publique.
- Si Redis est indisponible, les limiteurs laissent passer (et journalisent) plutôt que de bloquer
  toutes les connexions.

**Date** : 2026-09-26 — Phase 2.

---

## D0010 — Contenu des leçons : Markdown assaini, pas de MDX

**Contexte** : le brief parle de « Markdown/MDX stocké en BD ». Or le MDX se compile en JavaScript :
afficher du MDX venu de la base reviendrait à exécuter du code écrit par un rédacteur (professeur
en Phase 6), soit une faille XSS/RCE par construction.

**Décision** : les leçons sont en **Markdown** (tableaux, listes, citations, code) avec formules
`$…$` et `$$…$$`. Le rendu se fait côté API, en trois temps : `markdown-it` sans HTML brut → chaque
formule devient un marqueur neutre → `sanitize-html` avec liste blanche stricte → les marqueurs sont
remplacés par le rendu KaTeX (`trust: false`, qui refuse `\href`, `\url`…). Les images ne sont
acceptées que depuis nos propres médias (`/api/medias/…`), chargées en différé. Le HTML est calculé
**une fois, à la publication**, et stocké dans la version.

**Date** : 2026-09-26 — Phase 3.

---

## D0011 — Versionnage : copie de travail + versions publiées immuables

**Décision** : une `Lecon` porte la copie de travail (titre, Markdown, statut) ; chaque publication
crée une `VersionLecon` figée (titre, source, sections rendues, résumé, auteur de la publication) et
la leçon pointe vers sa version en ligne. Modifier une leçon publiée la repasse en brouillon **sans**
toucher la version en ligne : les élèves continuent de lire la version publiée jusqu'à la suivante.
Transitions : brouillon → en revue → publiée ; en revue → brouillon ; publiée → brouillon (par une
modification). Une leçon en revue est verrouillée. L'immuabilité est garantie par la base elle-même
(trigger qui refuse tout `UPDATE` sur `VersionLecon`), pas seulement par le code.

**Date** : 2026-09-26 — Phase 3.

---

## D0012 — Leçons publiées publiques, pagination par sections

**Décision** :
- Les leçons **publiées** sont lisibles **sans compte** : c'est la condition du référencement exigé
  par le brief (rendu serveur, sitemap) et du modèle freemium (« contenu de base gratuit »). Le
  contenu premium (examens blancs) sera verrouillé en Phase 9–10.
- Adresse : `/cours/{niveau}/{matière}/{slug}` ; le slug est fixé à la création (URL stable même si
  le titre change). Une section = un titre de niveau 2 (`##`) ; `?section=N` pour les suivantes.

**Date** : 2026-09-26 — Phase 3.

---

## D0013 — PDF par Chromium headless, généré une fois par version

**Contexte** : il faut un PDF fidèle, formules KaTeX comprises ; les bibliothèques PDF « pures »
ne savent pas rendre KaTeX.

**Décision** : l'API génère le PDF avec Chromium (`playwright-core`, même version que les tests),
à partir d'un gabarit HTML autonome (CSS et polices KaTeX intégrés, images de la leçon en data URI :
aucun accès réseau pendant le rendu). Le PDF est généré au premier téléchargement puis mis en cache
dans S3 sous l'identifiant de la version : une version étant immuable, son PDF l'est aussi.

**Conséquence** : l'image Docker de production de l'API devra embarquer Chromium
(`playwright install --with-deps chromium`, Phase 13).

**Date** : 2026-09-26 — Phase 3.

---

## D0014 — Règles du moteur de quiz

**Contexte** : le brief demande de tester les « réponses partielles sur QCM multiple » sans fixer la
règle de notation (choix tranché par le porteur du projet le 2026-09-26), et laisse ouverts plusieurs
points de fonctionnement.

**Décisions** :
- **QCM à plusieurs bonnes réponses** : proportionnel avec pénalité — barème × (bonnes cochées −
  mauvaises cochées) / nombre de bonnes, jamais négatif. Cocher toutes les cases ne rapporte rien.
  QCM à une seule bonne réponse, vrai/faux et réponse courte : tout ou rien.
- **Réponse courte** : casse, accents, espaces superflus et ponctuation finale ignorés ; virgule et
  point décimal équivalents ; apostrophes typographiques normalisées. Chaque question liste ses
  formulations acceptées (« 10 », « 10 cm »…).
- **Score** : pourcentage des points, arrondi au dixième ; points par question arrondis au centième.
  Seuil de réussite : 60 % (préparation de la Phase 5).
- **Tentatives** : quiz réservé aux comptes connectés ; nombre de tentatives illimité, toutes gardées
  dans l'historique ; **au plus une tentative en cours** par élève et par quiz (garanti par une
  contrainte d'unicité, même avec deux onglets). La position (question affichée) est enregistrée à
  chaque navigation pour reprendre exactement au même endroit.
- **Anti-triche** : la correction est faite côté serveur uniquement ; le quiz envoyé au navigateur
  est construit par liste blanche de champs (aucune bonne réponse, aucune explication). Le corrigé
  est figé dans la tentative à la soumission : l'historique ne change pas si le quiz est modifié
  ensuite.
- **Pas de minuteur** en Phase 4 : la durée limitée arrive avec les examens blancs (Phase 9).

**Date** : 2026-09-26 — Phase 4.

---

## D0015 — Progression, XP, badges, série et classement

**Contexte** : points ouverts du brief (Phase 5), tranchés par le porteur du projet le 2026-09-26
pour les quatre premiers.

**Décisions** :
- **Leçon terminée** : geste volontaire, bouton « J'ai terminé cette leçon » sur la dernière
  section (un saut direct à la fin via le sommaire ne valide rien).
- **Jour actif** (série) : une leçon terminée ou un quiz soumis, même raté, dans la journée
  calendaire de Dakar. Même jour ⇒ pas d'incrément ; lendemain ⇒ +1 ; jour manqué ⇒ la série repart.
  Une série est affichée tant que le dernier jour actif est aujourd'hui ou hier.
- **Classement** : sur demande uniquement (personne n'y figure par défaut), sous un pseudonyme
  choisi par l'élève (unique, lettres sans accent, chiffres, `_`, `-`), retrait possible à tout
  moment ; limité aux élèves du même niveau ; seuls pseudonyme et XP sont exposés.
- **Période du classement** : XP de la semaine, remise à zéro chaque lundi à 00:00 (heure de Dakar).
- **XP** : +10 par leçon terminée, +20 pour un quiz réussi (≥ 60 %), +10 de bonus pour 100 %, chaque
  gain une seule fois par leçon ou par quiz (refaire un quiz ne rapporte plus rien). Les gains sont
  inscrits dans un registre avec une contrainte d'unicité : aucune double attribution possible,
  même sous requêtes concurrentes. Les badges ne rapportent pas d'XP.
- **Badges** : Première leçon, Premier quiz réussi, Sans faute, Chapitre bouclé, Sept jours de
  suite, Lecteur assidu (dix leçons). Le catalogue vit dans le code et la table est alignée au
  démarrage de l'API. Chaque nouveau badge crée une notification in-app, une seule fois.
- **Avancement d'un chapitre** : une étape par leçon terminée, plus une par quiz réussi (si la
  leçon en a un) ; chapitre bouclé à 100 %. L'avancement d'une matière agrège les étapes de ses
  chapitres (et non la moyenne des pourcentages).
- **Mineurs** : le classement n'expose qu'un pseudonyme et un nombre d'XP, sans aucun moyen de
  contact ; il n'est donc pas conditionné à l'accord parental, contrairement au forum (Phase 7).
- Un incident d'enregistrement de la progression ne fait jamais échouer la soumission d'un quiz :
  la note est enregistrée d'abord, l'incident est journalisé.

**Date** : 2026-09-26 — Phase 5.

---

## D0016 — Studio professeur et circuit de validation

**Contexte** : Phase 6 du brief. Périmètre de création tranché par le porteur du projet le
2026-09-26 ; le reste découle du brief et des choix des phases 3 et 4.

**Décisions** :
- **Périmètre** : un professeur crée des **leçons** dans les **chapitres existants** ; la structure du
  programme (chapitres) reste à l'administration.
- **Machine à états par rôle** : BROUILLON → (soumettre) → EN_REVUE → (publier) → PUBLIE, ou
  EN_REVUE → (refuser) → BROUILLON. Le professeur peut modifier et soumettre ; seule
  l'administration publie ou refuse (403 sinon). Une leçon EN_REVUE est verrouillée pour tout le
  monde, admin compris : on la refuse pour la faire corriger. L'ancienne action « renvoyer en
  brouillon » sans motif disparaît au profit du refus.
- **Refus motivé** : commentaire obligatoire (10 à 2 000 caractères), conservé avec la leçon
  (historique des refus visible par l'auteur et par l'admin qui relit).
- **Propriété** : un professeur ne voit et ne modifie que ses propres leçons ; celles des autres lui
  répondent 404. Il peut supprimer un brouillon **jamais publié** ; une leçon en ligne ne se supprime
  pas depuis le studio.
- **Quiz relu avec la leçon** : le quiz édité dans le studio est stocké comme brouillon sur la leçon
  et n'est appliqué au quiz en ligne qu'à la publication, dans la même transaction que la nouvelle
  version. Les questions conservées gardent leur identifiant (une tentative en cours garde ses
  réponses), les questions retirées sont supprimées, un quiz vidé est retiré du site (l'historique
  des tentatives reste consultable). Les corrigés déjà rendus ne changent pas (figés à la
  soumission, D0014).
- **Notifications in-app** : l'auteur est prévenu de chaque changement de statut décidé par
  quelqu'un d'autre (soumission faite pour lui, refus avec le commentaire, publication,
  réouverture d'une leçon publiée par l'admin) ; les administrateurs sont prévenus de chaque
  nouvelle soumission. Personne n'est notifié de sa propre action. Un échec d'envoi est journalisé
  sans faire échouer l'action.
- **Statistiques professeur** (leçons en ligne uniquement) : **vues** = visiteurs distincts par
  heure (empreinte hachée IP + navigateur conservée une heure dans Redis, jamais en clair ; sans
  Redis, la vue n'est pas comptée plutôt que comptée en double) ; **taux de réussite** = part des
  quiz terminés **par des élèves** avec au moins 60 % ; **score moyen** sur ces mêmes tentatives.
  Les totaux sont pondérés par le nombre de tentatives.
- **Attribution** : « Cours proposé par Pr *Nom complet* » sur la leçon (et `author` dans les
  données structurées) quand l'auteur est un professeur ; les contenus de l'équipe (admins, seed)
  restent sans attribution.
- **Aperçu** : même moteur de rendu que la publication (Markdown + KaTeX, HTML assaini), appelé à la
  demande ; les professeurs peuvent téléverser des images avec les mêmes contrôles que l'admin.

**Date** : 2026-09-26 — Phase 6.

---

## D0017 — Forum modéré

**Contexte** : Phase 7 du brief. Quatre choix tranchés par le porteur du projet le 2026-10-07 ; le reste
découle du brief (mineurs, protection des données) et des phases précédentes.

**Décisions** :
- **Accès** : élèves, professeurs et administration ; **pas les parents** (ils suivront leurs enfants
  dans l'espace parent, Phase 8). Lecture comprise, le forum est fermé tant que le compte ne remplit
  pas les conditions de la Phase 2 (email confirmé, accord parental sous 15 ans) ; la page explique
  pourquoi. Le forum n'est pas public (pas de référencement).
- **Pseudonyme obligatoire** pour publier (le même que celui du classement, unique). L'API publique
  ne renvoie qu'un pseudonyme et un badge (« Professeur », « Équipe Xel-E ») : jamais de nom, d'email
  ni d'identifiant de compte.
- **Pièces jointes** : images et PDF, 5 Mo max., 3 par message, type vérifié sur les octets.
  **Antivirus ClamAV** (service `clamav` de docker-compose et de la CI, protocole clamd) appelé
  **avant** tout stockage ; en cas d'indisponibilité, le fichier est **refusé** (503) plutôt
  qu'accepté sans contrôle. Les PDF sont toujours téléchargés, jamais affichés dans la page.
- **Filtre de premier niveau** : liste de termes **en français** fournie au départ (migration et
  seed), **éditable par l'administration** (termes en wolof à ajouter par l'équipe) ; mots entiers,
  insensible aux accents, à la casse, aux chiffres « leet » et aux lettres répétées. Liens externes
  refusés pour les élèves (sauf vers Xel-E), permis aux professeurs. Message refusé avec explication
  plutôt que publié puis masqué.
- **Signalements** : un par compte et par message ; masquage automatique au 3e (comptes distincts) ;
  l'auteur voit son message masqué avec une explication, les autres un texte neutre.
- **Message innocenté** : il réapparaît, ses signalements sont soldés et il est marqué « vérifié » :
  de nouveaux signalements remontent dans la file **sans le masquer automatiquement** (évite qu'un
  groupe fasse masquer en boucle un message légitime).
- **Suppression** : douce (le texte reste en base pour l'historique), remplacée publiquement par
  « Message supprimé par la modération » ; l'auteur est notifié. L'admin peut aussi retirer un sujet.
- **Anti-flood** : 20 messages par compte par tranche de 10 minutes (Redis, sans blocage si Redis
  est indisponible).
- **Pas d'édition ni de suppression par l'auteur** en Phase 7 (à rediscuter) ; fil de discussion à
  plat (pas de réponses imbriquées).
- Notifications in-app : réponse à son sujet, suppression de son message ; admins prévenus d'un
  masquage automatique.

**Date** : 2026-10-07 — Phase 7.
