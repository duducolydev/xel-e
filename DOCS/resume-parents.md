# Résumé d'activité envoyé aux parents — à relire

Condition de validation de la Phase 8 : **contenu du résumé relu et approuvé** (ton, langue, données
affichées). Les exemples ci-dessous sont produits par le code réel
(`apps/api/src/parents/resume.ts`) ; toute modification demandée se fait à cet endroit, et les tests
de `resume-periodes.spec.ts` la vérifient.

## Quand et comment

| Fréquence (choix du parent) | Envoi | Période couverte |
|---|---|---|
| Hebdomadaire (par défaut) | dimanche à 18 h (heure de Dakar) | du lundi 00 h au dimanche 18 h |
| Mensuelle | le 1er du mois à 18 h | tout le mois précédent |
| Aucune | — | — |

Canaux : **dans l'espace parent** (toujours), **email** (activé par défaut), **WhatsApp** et **SMS**
(au choix, avec un numéro). Un parent qui suit plusieurs enfants reçoit **un seul résumé** qui les
regroupe. Chaque email contient un lien de désinscription en un clic.

## Données affichées, et ce qui ne l'est pas

Par enfant : temps d'activité (minutes réellement passées sur les leçons et les quiz, page au premier
plan), nombre de jours actifs, titres des leçons terminées, quiz passés avec leur score et la
moyenne, série de jours en cours (à partir de 2 jours).

Jamais : messages du forum, pseudonyme, classement, données d'autres élèves.

## Exemple 1 — email, deux enfants dont un sans activité

**Objet :** Semaine du 5 au 11 octobre : le résumé Xel-E

```text
Bonjour Mame Diop,

Voici le résumé de la semaine du 5 au 11 octobre sur Xel-E.

Fatou a travaillé 2 h 15, sur 4 jours.
Leçons terminées (2) : Le théorème de Pythagore, La réciproque de Pythagore.
Quiz (2, moyenne 78 %) : Le théorème de Pythagore (90 %), La réciproque de Pythagore (65 %).
Série en cours : 3 jours d'affilée, bravo !

Ali n'a pas travaillé sur Xel-E cette semaine. Un petit encouragement peut l'aider à reprendre : un quart d'heure par jour suffit pour progresser.

Le détail (scores, leçons, temps par jour) est dans votre espace parent :
https://xele.sn/parent

Ne plus recevoir ce résumé : https://xele.sn/desinscription?token=…

— L'équipe Xel-E
Xeeli ci xel
```

## Exemple 2 — email, semaine sans activité

```text
Bonjour Mame Diop,

Voici le résumé de la semaine du 5 au 11 octobre sur Xel-E.

Ali n'a pas travaillé sur Xel-E cette semaine. Un petit encouragement peut l'aider à reprendre : un quart d'heure par jour suffit pour progresser.

Vous pourrez suivre sa reprise, jour par jour, depuis votre espace parent :
https://xele.sn/parent

Ne plus recevoir ce résumé : https://xele.sn/desinscription?token=…

— L'équipe Xel-E
Xeeli ci xel
```

## Exemple 3 — WhatsApp, SMS et notification dans l'espace parent

```text
Xel-E, semaine du 5 au 11 octobre — Fatou : 2 h 15, 2 leçons, 2 quiz (moy. 78 %) ; Ali : pas d'activité.
```

Un seul SMS (moins de 160 caractères) pour deux enfants ; aucun lien dans les messages courts (le
parent retrouve le détail dans son espace).

## Points à trancher à la relecture

- **Ton** : vouvoiement du parent, prénom de l'enfant, encouragement plutôt que reproche en cas
  d'inactivité. À confirmer.
- **Langue** : français uniquement. Une version en wolof (au moins pour WhatsApp/SMS) est-elle
  souhaitée ?
- **Seuil des scores** : aucun jugement (« bien », « insuffisant ») n'est porté sur les scores ;
  faut-il en ajouter ?
- **Fournisseur WhatsApp/SMS** : en développement, les messages partent vers un fournisseur fictif
  (journalisés, non envoyés). Le fournisseur réel reste à choisir (D0018) ; sur WhatsApp, Meta impose
  des modèles de message validés à l'avance : le texte court ci-dessus servira de base.
