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
