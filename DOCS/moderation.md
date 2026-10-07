# Charte de modération du forum

Document de référence pour l'équipe de modération de Xel-E (Phase 7). La version courte, destinée aux
élèves, est affichée sur `/forum/charte`. Le public du forum est **mineur** : en cas de doute, on
protège.

## 1. Qui participe

| Profil | Lire | Publier | Modérer |
|---|---|---|---|
| Élève (email confirmé, ou inscrit par identifiant ; accord parental reçu s'il a moins de 15 ans) | ✓ | ✓ | — |
| Professeur validé | ✓ | ✓ (badge « Professeur », liens externes permis) | — |
| Administration | ✓ | ✓ (badge « Équipe Xel-E ») | ✓ |
| Parent, visiteur, compte non confirmé, moins de 15 ans sans accord | ✗ | ✗ | — |

- **Pseudonyme obligatoire** pour publier. Ni nom, ni email, ni identifiant de connexion ne sont
  jamais affichés ou transmis par l'API publique du forum (vérifié par des tests automatisés).
- L'administration voit le nom réel de l'auteur d'un message **signalé**, uniquement dans la file de
  modération, pour pouvoir agir (prévenir les parents, suspendre un compte).

## 2. Ce qui est interdit

1. Insultes, moqueries, harcèlement, menaces, incitation à se faire du mal.
2. Propos racistes, sexistes, homophobes ou discriminatoires.
3. Contenus sexuels, violents ou choquants (texte, image ou PDF).
4. Coordonnées personnelles (nom complet, téléphone, adresse, école, réseaux sociaux) — les siennes
   comme celles des autres ; toute tentative de contact hors du forum.
5. Liens vers d'autres sites pour les élèves (les professeurs peuvent partager des ressources fiables).
6. Publicité, spam, messages répétés.
7. Triche : réponses de quiz ou d'examens blancs, devoirs faits à la place d'un autre.

## 3. Barrières automatiques (avant publication)

| Barrière | Effet | Où |
|---|---|---|
| Termes interdits | Message refusé avec une explication ; l'élève reformule | `apps/api/src/forum/filtre-contenu.ts` |
| Liens externes (élèves) | Refusés, sauf liens vers Xel-E | idem |
| Pièces jointes | Images PNG/JPEG/GIF/WebP et PDF, 5 Mo max., 3 par message ; **antivirus ClamAV** avant stockage ; si l'antivirus est indisponible, le fichier est refusé | `pieces-jointes.service.ts`, `antivirus.service.ts` |
| Anti-flood | 20 messages par compte et par tranche de 10 minutes | `forum.service.ts` |

**Filtre de termes** : comparaison en mots entiers, sans tenir compte des majuscules, des accents,
des chiffres déguisés (`c0nn4rd`) ni des lettres répétées (`connnnard`). La liste de départ est en
français ; l'administration la complète depuis `/admin/moderation` (termes en wolof notamment).

**Faux positifs connus et écartés volontairement de la liste** (le contexte scolaire les rend
fréquents) : « sexe » (SVT), « chatte » (l'animal), « con » (trop court, présent dans des expressions
courantes), « crève » (« une crève » = un rhume). Grâce à la recherche en mots entiers, « dispute »,
« pdf » ou « TGV » ne déclenchent pas « pute », « pd » ou « tg ».

**Limites connues** : lettres séparées par des espaces (`c o n n a r d`), fautes volontaires, images
au contenu inapproprié (l'antivirus ne juge pas le contenu d'une image). Ces cas relèvent du
signalement et de la modération humaine.

## 4. Signalements

- Bouton « Signaler » sous chaque message (sauf le sien), motif facultatif. **Un signalement par
  compte et par message.**
- **Au 3e signalement de comptes distincts**, le message est **masqué immédiatement** pour tout le
  monde sauf son auteur (qui voit qu'il est en attente de vérification), et l'administration est
  notifiée.
- Tout message signalé, masqué ou non, apparaît dans la file `/admin/moderation`, les masqués
  d'abord puis les plus signalés.

## 5. Décisions de la modération

| Décision | Quand | Effet |
|---|---|---|
| **Innocenter et rétablir** | Le message respecte la charte (signalement abusif ou malentendu) | Le message réapparaît ; ses signalements sont soldés ; il est marqué « vérifié » et **ne sera plus masqué automatiquement** (de nouveaux signalements remontent dans la file, sans masquage) |
| **Supprimer le message** | Le message enfreint la charte | Le message est remplacé par « Message supprimé par la modération » ; son auteur reçoit une notification ; le texte reste en base pour l'historique |
| **Supprimer le sujet** | Le sujet entier est hors charte | Le sujet et ses pièces jointes disparaissent du forum |

Délai visé : traiter la file **chaque jour ouvré** ; un message masqué depuis plus de 48 h doit être
tranché en priorité.

**Situations graves** (menace, harcèlement répété, mise en danger d'un élève, contenu sexuel
impliquant un mineur) : supprimer immédiatement, conserver les éléments, prévenir la direction de
Xel-E le jour même ; le cas échéant, contacter les parents et les autorités compétentes. Le contenu
illicite n'est jamais téléchargé ni partagé en dehors de cette procédure.

## 6. Données

- Les pièces jointes sont stockées sous un identifiant aléatoire (jamais le nom d'origine) et servies
  avec `X-Content-Type-Options: nosniff` et une politique de sécurité qui interdit tout script ; les
  PDF sont toujours téléchargés, jamais affichés dans la page.
- L'identité des signalants n'est montrée à personne, auteur compris.
- Évolutions prévues : historique des sanctions par compte et suspension temporaire, notification
  des parents (Phase 8), purge des pièces jointes jamais publiées.
