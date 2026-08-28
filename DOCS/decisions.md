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
