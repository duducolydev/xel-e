# Matrice d'accès — rôle × ressource

État à la fin de la Phase 2. Chaque ligne est vérifiée automatiquement :

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

Toute route est **protégée par défaut** (guard global) : une nouvelle route non annotée `@Public()`
exige une session, et `@Roles(...)` restreint en plus par rôle.

## Pages du front

| Page | Anonyme | Élève | Professeur | Parent | Admin |
|---|---|---|---|---|---|
| `/`, `/connexion`, `/inscription`, `/mot-de-passe-oublie` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/confirmer-email`, `/consentement-parental`, `/reinitialiser-mot-de-passe` | ✓ (lien reçu) | ✓ | ✓ | ✓ | ✓ |
| `/tableau-de-bord` | → `/connexion` | ✓ | ✓ | ✓ | ✓ |
| `/admin` | → `/connexion` | → `/tableau-de-bord?acces=refuse` | → idem | → idem | ✓ |

C'est l'API qui fait autorité : la page `/admin` redirige sur la réponse 403 de l'API, pas sur une
vérification côté front.

## Restrictions liées au compte (pas au rôle)

| Situation | Effet |
|---|---|
| Professeur non encore validé par un admin | Connexion refusée (403, message explicite) |
| Email renseigné mais pas encore confirmé | Connexion possible ; **forum fermé** |
| Élève de moins de 15 ans sans accord parental | Connexion et cours possibles ; **forum fermé** |
| Âge d'un élève inconnu | Traité comme moins de 15 ans (règle la plus protectrice) |

L'accès au forum est exposé par `GET /auth/moi` (`accesForum`) et sera appliqué aux routes du forum
en Phase 7.
