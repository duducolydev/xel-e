# Examens blancs de démonstration — à relire

Condition de validation de la Phase 9 : **un examen blanc complet relu** (fidélité au format du BFEM).
Ce document est généré à partir du contenu réel (`apps/api/prisma/bfem-demo.ts`) ; les corrections se
font dans ce fichier, et le test `examens-demo.spec.ts` vérifie que chaque bonne réponse rapporte tous
ses points et que le total fait 20.

## Comment l'examen est corrigé

- Correction automatique côté serveur, question par question (même moteur que les quiz) : QCM et
  vrai/faux en tout ou rien ; réponses courtes comparées sans tenir compte des majuscules, des
  accents, des espaces superflus, de la virgule ou du point décimal et du point final. Les formes
  acceptées sont listées dans la colonne « Réponse(s) acceptée(s) » (ex. `2/4` n'est pas accepté là
  où une fraction irréductible est demandée).
- Note sur 20 = points obtenus / points du sujet × 20, arrondie au centième.
- Durée : celle de l'épreuve (Mathématiques : 120 min **provisoire**, à confirmer dans
  l'administration, D0019). À la fin du temps, la copie est rendue automatiquement ; seules les
  réponses reçues avant la limite comptent.

## Limite assumée

Le BFEM réel demande des rédactions et des démonstrations (justifier, construire une figure).
Un examen blanc corrigé automatiquement découpe chaque exercice en questions à réponse précise : il
entraîne aux calculs et aux raisonnements attendus, pas à la rédaction. Les **annales** (sujets
officiels en PDF avec leur corrigé) complètent cet entraînement.

## Points à trancher à la relecture

- Les trois exercices (activités numériques, système et fonction affine, géométrie : Pythagore,
  trigonométrie, Thalès) et la répartition des points (6 / 6 / 8) sont-ils fidèles au BFEM ?
- Les énoncés et formes de réponses acceptées sont-ils clairs pour un élève de 3e ?
- Faut-il proposer le second examen (Premium) sur un format plus court comme ici, ou au même format ?

## Examen blanc BFEM n°1 — Mathématiques (gratuit)

**Consignes affichées :**

> Le sujet comporte trois exercices notés sur 20 points.
> Calculatrice non programmable autorisée. Réponds dans chaque champ par un nombre (décimal avec une virgule, ou fraction irréductible quand c'est demandé) ; l'unité est facultative.
> Tes réponses sont enregistrées au fur et à mesure. À la fin du temps, ta copie est rendue automatiquement.

| # | Énoncé | Type | Points | Réponse(s) acceptée(s) | Explication du corrigé |
|---|---|---|---|---|---|
| 1 | Exercice 1. a) Calcule A = 3/4 − 2/3 × 3/8 et donne le résultat sous forme de fraction irréductible. | Réponse courte | 1 | 1/2 · 0,5 | 2/3 × 3/8 = 6/24 = 1/4, donc A = 3/4 − 1/4 = 2/4 = 1/2. |
| 2 | Exercice 1. b) On pose B = √50 − 3√2 + √8. B s'écrit a√2 : quelle est la valeur de a ? | Réponse courte | 1 | 4 | √50 = 5√2 et √8 = 2√2, donc B = 5√2 − 3√2 + 2√2 = 4√2 : a = 4. |
| 3 | Exercice 1. c) Le développement de (2x − 3)² est : | QCM (4x² − 9 / 4x² − 12x + 9 / 4x² + 12x + 9 / 2x² − 12x + 9) | 1 | 4x² − 12x + 9 | (a − b)² = a² − 2ab + b² avec a = 2x et b = 3 : 4x² − 12x + 9. |
| 4 | Exercice 1. d) Une factorisation de 9x² − 25 est : | QCM ((3x − 5)² / (3x − 5)(3x + 5) / (9x − 5)(x + 5) / 3(3x² − 25)) | 1 | (3x − 5)(3x + 5) | 9x² − 25 = (3x)² − 5² = (3x − 5)(3x + 5) (identité a² − b²). |
| 5 | Exercice 1. e) Résous l'équation 3x − 7 = 2x + 5. Donne la valeur de x. | Réponse courte | 2 | 12 · x = 12 · x=12 | 3x − 2x = 5 + 7, donc x = 12. |
| 6 | Exercice 2. On considère le système { x + y = 11 ; 2x − y = 7 }. a) Donne la valeur de x. | Réponse courte | 1 | 6 · x = 6 · x=6 | En additionnant les deux équations : 3x = 18, donc x = 6. |
| 7 | Exercice 2. b) Donne la valeur de y. | Réponse courte | 1 | 5 · y = 5 · y=5 | y = 11 − x = 11 − 6 = 5. |
| 8 | Exercice 2. c) Soit f la fonction affine définie par f(x) = −2x + 3. Vrai ou faux : f est croissante. | Vrai/faux | 1 | Faux | Le coefficient directeur −2 est négatif : f est décroissante. |
| 9 | Exercice 2. d) Calcule f(4). | Réponse courte | 1 | -5 · −5 | f(4) = −2 × 4 + 3 = −8 + 3 = −5. |
| 10 | Exercice 2. e) Quel nombre a pour image 7 par f ? | Réponse courte | 2 | -2 · −2 · x = -2 · x=-2 | −2x + 3 = 7 donne −2x = 4, donc x = −2. |
| 11 | Exercice 3. ABC est un triangle rectangle en A avec AB = 6 cm et AC = 8 cm. a) Calcule BC (en cm). | Réponse courte | 2 | 10 · 10 cm · 10cm | Théorème de Pythagore : BC² = AB² + AC² = 36 + 64 = 100, donc BC = 10 cm. |
| 12 | Exercice 3. b) Calcule cos(ABC), le cosinus de l'angle de sommet B (valeur décimale). | Réponse courte | 1 | 0,6 · 3/5 | cos(ABC) = côté adjacent / hypoténuse = AB / BC = 6 / 10 = 0,6. |
| 13 | Exercice 3. c) M est le point de [AB] tel que AM = 3 cm. La parallèle à (BC) passant par M coupe [AC] en N. Calcule AN (en cm). | Réponse courte | 2 | 4 · 4 cm · 4cm | (MN) // (BC) : d'après le théorème de Thalès, AM/AB = AN/AC, soit 3/6 = AN/8, donc AN = 4 cm. |
| 14 | Exercice 3. d) Calcule MN (en cm). | Réponse courte | 1 | 5 · 5 cm · 5cm | AM/AB = MN/BC, soit 3/6 = MN/10, donc MN = 5 cm. |
| 15 | Exercice 3. e) L'aire du triangle ABC est : | QCM (48 cm² / 24 cm² / 14 cm² / 30 cm²) | 1 | 24 cm² | Aire = (AB × AC) / 2 = (6 × 8) / 2 = 24 cm². |
| 16 | Exercice 3. f) Vrai ou faux : le centre du cercle circonscrit au triangle ABC est le milieu de [BC]. | Vrai/faux | 1 | Vrai | Dans un triangle rectangle, le centre du cercle circonscrit est le milieu de l'hypoténuse [BC]. |

**Total : 20 points.**

## Examen blanc BFEM n°2 — Mathématiques (Premium)

**Consignes affichées :**

> Cinq questions notées sur 20 points. Calculatrice non programmable autorisée.

| # | Énoncé | Type | Points | Réponse(s) acceptée(s) | Explication du corrigé |
|---|---|---|---|---|---|
| 1 | 1. Calcule C = 5/6 + 1/3 ÷ 2. | Réponse courte | 4 | 1 | 1/3 ÷ 2 = 1/6, donc C = 5/6 + 1/6 = 1. |
| 2 | 2. Le produit (x + 2)(x − 2) est égal à : | QCM (x² − 4 / x² + 4 / x² − 4x + 4 / x² − 2) | 4 | x² − 4 | (a + b)(a − b) = a² − b² : x² − 4. |
| 3 | 3. Résous l'inéquation 2x + 3 < 11 (écris la solution sous la forme x < …). | Réponse courte | 4 | x < 4 · x<4 | 2x < 8, donc x < 4. |
| 4 | 4. Le périmètre d'un cercle de rayon 5 cm s'écrit a × π cm. Quelle est la valeur de a ? | Réponse courte | 4 | 10 | P = 2 × π × r = 2 × π × 5 = 10π. |
| 5 | 5. Vrai ou faux : dans un triangle rectangle, le carré de l'hypoténuse est égal à la somme des carrés des deux autres côtés. | Vrai/faux | 4 | Vrai | C'est l'énoncé du théorème de Pythagore. |

**Total : 20 points.**
