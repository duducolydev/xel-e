# Paiements Wave et Orange Money

Fonctionnement des paiements (Phase 10) et **procédure de validation en sandbox réelle**, obligatoire
avant toute mise en production (condition de validation du brief). Décisions : D0020.

## Principe

1. L'élève (ou un parent lié) choisit une offre et un moyen de paiement sur `/abonnement`.
2. L'API crée un paiement `EN_ATTENTE` avec une référence `XE-…` et ouvre une session chez le
   fournisseur, qui renvoie l'URL de paiement ; l'utilisateur y est redirigé.
3. Le fournisseur notifie le résultat par **webhook** (`POST /api/webhooks/<fournisseur>`). L'API :
   vérifie la signature (401 sinon, rien n'est écrit), journalise l'événement (un même événement
   n'est traité qu'une fois), confirme le paiement **une seule fois** (passage `EN_ATTENTE →
   CONFIRME` conditionnel) et crée la période Premium, sans chevauchement avec une période en cours.
   Un traitement en échec est rejoué par une file BullMQ (8 tentatives, backoff exponentiel).
4. Au retour sur Xel-E (`/abonnement/retour`), la page interroge aussi le fournisseur (au cas où le
   webhook tarde) puis affiche la confirmation et le reçu.
5. Toutes les heures : expiration des périodes terminées (rétrogradation douce : l'accès Premium se
   ferme, les données restent) et relance in-app + email 3 jours avant l'échéance.

Le **simulateur** (`PAIEMENTS_SIMULES=true`, interdit en production) remplace la page du fournisseur
en développement et dans les tests ; il produit des webhooks signés traités par le même chemin.

## Configuration

| Variable | Rôle |
|---|---|
| `WAVE_API_KEY`, `WAVE_WEBHOOK_SECRET`, `WAVE_API_URL` | Clé API Wave Business, secret de signature des webhooks, URL de l'API (`https://api.wave.com`) |
| `OM_API_KEY` | En-tête d'autorisation fourni par Orange Developer (`Basic …`) |
| `OM_MERCHANT_KEY` | Clé marchand Orange Money |
| `OM_WEBHOOK_SECRET` | Secret ajouté par Xel-E à l'URL de notification (`?cle=…`) et vérifié à la réception |
| `OM_API_URL`, `OM_WEBPAY_CHEMIN`, `OM_DEVISE` | `https://api.orange.com`, `/orange-money-webpay/dev/v1` et `OUV` en sandbox ; chemin et devise de production à confirmer avec Orange (`XOF`) |
| `PAIEMENTS_SIMULES`, `PAIEMENT_SIMULE_SECRET` | Simulateur (développement, tests) ; `false` en production |
| `APP_URL` | Base des URL de retour et de notification (`https://…/api/webhooks/…`) |

Un fournisseur n'apparaît sur `/abonnement` que si toutes ses variables sont renseignées.

**Webhooks à déclarer chez les fournisseurs** :
- Wave : `https://<domaine>/api/webhooks/wave` (événements `checkout.session.completed` et
  `checkout.session.payment_failed`), avec le secret de signature dans `WAVE_WEBHOOK_SECRET`.
- Orange Money : l'URL de notification est transmise à chaque paiement
  (`https://<domaine>/api/webhooks/orange-money?cle=<OM_WEBHOOK_SECRET>`).

## Adaptateurs : ce qui est supposé et doit être vérifié

Les adaptateurs ont été écrits d'après la **documentation publique** des fournisseurs et testés sur
des réponses simulées (`apps/api/src/paiements/fournisseurs.spec.ts`). Points à confirmer en sandbox :

**Wave (Checkout API)**
- Création : `POST /v1/checkout/sessions` avec `amount` (texte), `currency: "XOF"`,
  `client_reference`, `success_url`, `error_url`, en-tête `Idempotency-Key` → `id`, `wave_launch_url`.
- État : `GET /v1/checkout/sessions/:id` → `payment_status` (`succeeded`, `cancelled`…),
  `checkout_status` (`complete`, `expired`…), `amount`.
- Webhook : en-tête `Wave-Signature: t=<horodatage>,v1=<HMAC-SHA256(secret, t + corps brut)>`,
  corps `{ id, type, data: { id, client_reference, payment_status, amount } }`.

**Orange Money (Web Payment, Orange Developer)**
- Jeton : `POST /oauth/v3/token` (`grant_type=client_credentials`, en-tête `OM_API_KEY`).
- Paiement : `POST {chemin}/webpayment` (`merchant_key`, `currency`, `order_id`, `amount`,
  `return_url`, `cancel_url`, `notif_url`, `lang`, `reference`) → `pay_token`, `payment_url`,
  `notif_token`.
- Notification : `{ status, notif_token, txnid }` ; le `notif_token` doit être celui du paiement.
- État : `POST {chemin}/transactionstatus` (`order_id`, `amount`, `pay_token`) → `status`.
- Orange Sénégal (Sonatel) propose aussi une API marchande plus récente : si c'est elle qui est
  retenue, seul `FournisseurOrangeMoney` est à adapter (l'interface `PaymentProvider` ne change pas).

## Procédure de validation en sandbox (avant la production)

Pour **chaque** fournisseur, avec les clés de sandbox dans `.env` et `PAIEMENTS_SIMULES=false` :

1. Exposer l'API en HTTPS (tunnel ou serveur de recette) et déclarer l'URL de webhook.
2. Payer l'offre mensuelle depuis `/abonnement` avec un compte de test : vérifier la redirection,
   le paiement chez le fournisseur, le retour sur `/abonnement/retour`, l'accès Premium immédiat,
   la notification et le reçu PDF.
3. Annuler un paiement chez le fournisseur : le paiement passe à « Échoué », aucun accès n'est ouvert.
4. Rejouer le même webhook (outil du fournisseur ou `curl`) : réponse `deja-traite`, aucun doublon.
5. Envoyer un webhook avec une signature fausse : réponse 401, rien dans `EvenementPaiement`.
6. Couper l'API pendant un paiement puis la relancer : la vérification au retour, ou le webhook
   rejoué par le fournisseur, confirme le paiement.
7. Renouveler avant l'échéance : la nouvelle période commence à la fin de la précédente.
8. Vérifier les montants : un écart de montant laisse le paiement en attente et l'événement en
   échec (à examiner).
9. Consigner les écarts avec la documentation dans ce fichier et ajuster l'adaptateur et ses tests.
