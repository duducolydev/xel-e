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
donc `localhost:5433`. Sur une machine sans conflit de port, il suffit d'adapter `DATABASE_URL`
localement si l'on préfère `5432` — le choix `5433` n'est pas une contrainte du projet, seulement le
défaut le plus sûr pour éviter un faux `degraded` silencieux.

**Date** : 2026-08-28 — Phase 0.
