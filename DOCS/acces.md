# Matrice d'accès — rôle × ressource

État à la fin de la Phase 9. Chaque ligne est vérifiée automatiquement :

- API : `apps/api/test/acces.e2e-spec.ts` rejoue la matrice ci-dessous avec les comptes de démo
  (`MATRICE` dans le test ⇔ tableau « API » de ce document, à garder identiques).
- Front : `e2e/auth.spec.ts` (Playwright) vérifie les redirections des pages protégées.
- Règle mineur : `apps/api/src/auth/acces-forum.spec.ts`.

Légende : **200/204** autorisé · **401** non connecté · **403** connecté mais rôle non autorisé ·
**404** autorisé mais ressource introuvable.

## API

| Ressource | Anonyme | Élève | Professeur | Parent | Admin |
|---|---|---|---|---|---|
| `GET /health` | 200 | 200 | 200 | 200 | 200 |
| `POST /auth/inscription/{eleve,professeur,parent}` | public | public | public | public | public |
| `POST /auth/connexion`, `/auth/rafraichir`, `/auth/deconnexion` | public | public | public | public | public |
| `POST /auth/confirmer-email`, `/auth/consentement-parental` | public (jeton) | public (jeton) | public (jeton) | public (jeton) | public (jeton) |
| `POST /auth/mot-de-passe-oublie`, `/auth/reinitialiser-mot-de-passe` | public (jeton) | public (jeton) | public (jeton) | public (jeton) | public (jeton) |
| `GET /auth/moi` | 401 | 200 | 200 | 200 | 200 |
| `GET /admin/professeurs/en-attente` | 401 | 403 | 403 | 403 | 200 |
| `POST /admin/professeurs/:id/valider` | 401 | 403 | 403 | 403 | 204 (404 si id inconnu) |
| `GET /catalogue`, `/catalogue/:niveau/:matiere`, `/catalogue/plan-du-site` | 200 | 200 | 200 | 200 | 200 |
| `GET /lecons/:slug`, `/lecons/:slug/pdf` (leçon publiée) | 200 | 200 | 200 | 200 | 200 |
| `GET /lecons/:slug` (brouillon ou en revue) | 404 | 404 | 404 | 404 | 404 |
| `GET /medias/:fichier` | 200 | 200 | 200 | 200 | 200 |
| `POST /lecons/:slug/vue` (compteur de lectures, dédoublonné par visiteur et par heure) | 204 | 204 | 204 | 204 | 204 |
| `GET/POST/PATCH/DELETE /admin/chapitres…`, `/admin/lecons…` (création, édition, soumission, publication) | 401 | 403 | 403 | 403 | 2xx |
| `POST /admin/lecons/:id/rejeter` (refus motivé, commentaire obligatoire) | 401 | 403 | 403 | 403 | 200 (400 sans commentaire) |
| `GET /admin/revue` (file des leçons en revue) | 401 | 403 | 403 | 403 | 200 |
| `POST /admin/medias` (téléversement d’image) | 401 | 403 | 403 | 403 | 201 |
| `GET /studio` (ses leçons, statistiques, notifications), `GET /studio/chapitres` | 401 | 403 | 200 | 403 | 200 |
| `POST /studio/lecons`, `POST /studio/apercu`, `POST /studio/medias` | 401 | 403 | 2xx | 403 | 2xx |
| Lire, modifier, soumettre, supprimer (brouillon jamais publié) **sa** leçon — `/studio/lecons/:id…` | 401 | 403 | 2xx | 403 | 2xx |
| Même chose sur la leçon **d’un autre** professeur | 401 | 403 | 404 | 403 | 2xx |
| Modifier une leçon **en revue** (verrouillée) | 401 | 403 | 409 | 403 | 409 |
| `GET /quiz/lecons/:slug`, démarrage et reprise d’une tentative | 401 | 200 | 200 | 200 | 200 |
| `GET /quiz/tentatives` (son propre historique) | 401 | 200 | 200 | 200 | 200 |
| Lire, remplir ou soumettre **sa** tentative | 401 | 2xx | 2xx | 2xx | 2xx |
| Lire, remplir ou soumettre la tentative **d’un autre** | 401 | 404 | 404 | 404 | 404 |
| `GET /progression/tableau-de-bord`, `GET /progression/classement`, `POST /progression/lecons/:slug/terminer` | 401 | 200 | 200 | 200 | 200 |
| `PUT /progression/classement` (participer au classement) | 401 | 204 | 403 | 403 | 403 |
| `GET /forum/etat` (forum ouvert ou non à ce compte, et pourquoi) | 401 | 200 | 200 | 403 | 200 |
| Lire le forum, publier, signaler, téléverser une pièce jointe — `/forum…` | 401 | 2xx ¹ | 2xx | 403 | 2xx |
| `GET /forum/pieces-jointes/:id` (message masqué ou supprimé) | 401 | 404 (sauf son auteur) | 404 (idem) | 403 | 200 |
| `/admin/moderation…` (file, innocenter, supprimer, termes interdits) | 401 | 403 | 403 | 403 | 2xx |
| `POST /parents/code` (code de liaison pour son parent), `GET /parents/mes-parents`, `POST /activite/presence` | 401 | 2xx | 403 | 403 | 403 |
| `GET /parents`, `POST /parents/liaison`, `PUT /parents/preferences` | 401 | 403 | 403 | 2xx | 403 |
| `GET/DELETE /parents/enfants/:id`, `POST /parents/enfants/:id/accord-parental` (enfant **lié**) | 401 | 403 | 403 | 2xx | 403 |
| Même chose pour un enfant **non lié** | 401 | 403 | 403 | **403** | 403 |
| `POST /parents/desinscription` (lien des emails, jeton signé) | public | public | public | public | public |
| `POST /admin/eleves/:id/code-liaison`, `POST /admin/resumes/declencher` | 401 | 403 | 403 | 403 | 2xx |
| `GET /bfem/examens`, `/bfem/annales`, `/bfem/historique`, `/bfem/simulation`, `/bfem/epreuves` | 401 | 200 | 403 | 403 | 200 |
| Démarrer un examen blanc ou télécharger une annale **gratuits** | 401 | 2xx | 403 | 403 | 2xx |
| Même chose pour un contenu **Premium** sans abonnement actif | 401 | **403** | 403 | 403 | 2xx (admin) |
| Lire, remplir, rendre **sa** copie d'examen blanc ; celle **d'un autre** | 401 | 2xx ; 404 | 403 | 403 | 2xx ; 404 |
| `/admin/bfem…` (épreuves, examens, annales), `POST /admin/abonnements` | 401 | 403 | 403 | 403 | 2xx |

¹ Élève : 403 tant que son email n'est pas confirmé, ou, s'il a moins de 15 ans, tant que son
parent n'a pas donné son accord (message explicite). Publier exige en plus un pseudonyme (400).

Toute route est **protégée par défaut** (guard global) : une nouvelle route non annotée `@Public()`
exige une session, et `@Roles(...)` restreint en plus par rôle.

## Pages du front

| Page | Anonyme | Élève | Professeur | Parent | Admin |
|---|---|---|---|---|---|
| `/`, `/connexion`, `/inscription`, `/mot-de-passe-oublie` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/confirmer-email`, `/consentement-parental`, `/reinitialiser-mot-de-passe` | ✓ (lien reçu) | ✓ | ✓ | ✓ | ✓ |
| `/cours`, `/cours/:niveau`, `/cours/:niveau/:matiere` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/cours/:niveau/:matiere/:slug` (leçon publiée) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/cours/:niveau/:matiere/:slug` (brouillon) | 404 | 404 | 404 | 404 | 404 |
| `/cours/:niveau/:matiere/:slug/quiz`, `/quiz/resultats/:id`, `/mes-quiz` | → `/connexion` | ✓ | ✓ | ✓ | ✓ |
| `/tableau-de-bord` | → `/connexion` | ✓ | ✓ | ✓ | ✓ |
| `/classement` | → `/connexion` | ✓ | → `/tableau-de-bord` | → idem | → idem |
| `/admin`, `/admin/revue`, `/admin/revue/:id` | → `/connexion` | → `/tableau-de-bord?acces=refuse` | → idem | → idem | ✓ |
| `/studio`, `/studio/lecons/:id` | → `/connexion` | → `/tableau-de-bord?acces=refuse` | ✓ (ses leçons) | → idem | ✓ |
| `/forum`, `/forum/:niveau/:matiere`, `/forum/sujets/:id`, `/forum/charte` | → `/connexion` | ✓ (fermé avec explication si conditions non réunies) | ✓ | → `/tableau-de-bord?acces=refuse` | ✓ |
| `/admin/moderation` | → `/connexion` | → `/tableau-de-bord?acces=refuse` | → idem | → idem | ✓ |
| `/parent`, `/parent/enfants/:id` (enfant lié ; sinon retour à `/parent`) | → `/connexion` | → `/tableau-de-bord?acces=refuse` | → idem | ✓ | → idem |
| `/desinscription` (lien reçu par email) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/bfem`, `/bfem/examens/:slug`, `/bfem/copies/:id…`, `/bfem/historique`, `/bfem/simulation` | → `/connexion` | ✓ | → `/tableau-de-bord?acces=refuse` | → idem | ✓ |
| `/admin/bfem` | → `/connexion` | → `/tableau-de-bord?acces=refuse` | → idem | → idem | ✓ |

C'est l'API qui fait autorité : les pages `/admin` et `/studio` redirigent sur la réponse 403 de
l'API, pas sur une vérification côté front.

**Circuit de publication par rôle** (`apps/api/src/contenus/workflow.ts`, testé unitairement) : un
professeur crée, modifie et soumet **ses** leçons ; seule l'administration publie ou refuse. Un
professeur qui tente de publier ou de refuser reçoit 403, et une leçon d'un autre auteur lui
renvoie 404 (son existence n'est pas révélée).

Les brouillons ne sont jamais servis par les routes publiques, admin compris : l’admin relit une
copie de travail via `GET /admin/lecons/:id`, `GET /admin/lecons/:id/apercu` et
`GET /studio/lecons/:id` (leçon et quiz de travail), le professeur via `GET /studio/lecons/:id`.

## Restrictions liées au compte (pas au rôle)

| Situation | Effet |
|---|---|
| Professeur non encore validé par un admin | Connexion refusée (403, message explicite) |
| Email renseigné mais pas encore confirmé | Connexion possible ; **forum fermé** |
| Élève de moins de 15 ans sans accord parental | Connexion et cours possibles ; **forum fermé** |
| Âge d'un élève inconnu | Traité comme moins de 15 ans (règle la plus protectrice) |

L'accès au forum est exposé par `GET /auth/moi` (`accesForum`) et `GET /forum/etat` (avec la raison
de fermeture), et appliqué à toutes les routes du forum, lecture comprise. Règles de modération :
`DOCS/moderation.md`.
