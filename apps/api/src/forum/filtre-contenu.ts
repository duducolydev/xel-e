// Filtre de premier niveau des messages du forum : termes interdits et liens externes.
// Il ne remplace pas la modération humaine (signalements) : il arrête l'évident avant publication.

const SUBSTITUTIONS: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

// Minuscules, sans accents, chiffres « leet » remplacés, lettres répétées réduites (« connnnard »).
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => SUBSTITUTIONS[c] ?? c)
    .replace(/(\p{L})\1+/gu, "$1");
}

function mots(texte: string): string[] {
  return normaliser(texte).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

// Un terme (un ou plusieurs mots) est cherché comme une suite de mots entiers :
// « pute » bloque « pute » mais pas « dispute ».
export function termesTrouves(texte: string, termes: readonly string[]): string[] {
  const motsTexte = mots(texte);
  const trouves = new Set<string>();
  for (const terme of termes) {
    const motsTerme = mots(terme);
    if (motsTerme.length === 0) continue;
    for (let i = 0; i + motsTerme.length <= motsTexte.length; i += 1) {
      if (motsTerme.every((mot, j) => motsTexte[i + j] === mot)) {
        trouves.add(terme);
        break;
      }
    }
  }
  return [...trouves];
}

// Extensions de domaine reconnues sans « http » ni « www » : limite les faux positifs
// (« 3.14 », « fig.2 », « photo.jpg » ne sont pas des liens).
const TLD =
  "com|net|org|info|biz|io|co|me|ly|gl|gg|tv|app|dev|xyz|online|site|link|click|top|club|live|shop|tk|ml|ga|cf|sn|fr|be|ch|ca|ci|bf|gn|ma|tn|dz|cm|us|uk|de|ru|cn|in|br";
const MOTIF_LIEN = new RegExp(
  `(?:https?:\\/\\/|www\\.)\\S+|\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TLD})\\b(?:\\/\\S*)?`,
  "gi",
);

export function liensTrouves(texte: string): string[] {
  return [...texte.matchAll(MOTIF_LIEN)].map((m) => m[0]);
}

// Les liens vers Xel-E lui-même restent autorisés (renvoyer vers une leçon).
export function estLienInterne(lien: string, domaineSite: string): boolean {
  const sansSchema = lien.replace(/^https?:\/\//i, "").replace(/^www\./i, "").toLowerCase();
  const domaine = domaineSite.replace(/^www\./i, "").toLowerCase();
  return sansSchema === domaine || sansSchema.startsWith(`${domaine}/`) || sansSchema.startsWith(`${domaine}:`);
}

export interface VerdictFiltre {
  accepte: boolean;
  raisons: string[];
}

export function filtrerMessage(
  texte: string,
  options: { termes: readonly string[]; liensAutorises: boolean; domaineSite: string },
): VerdictFiltre {
  const raisons: string[] = [];
  if (termesTrouves(texte, options.termes).length > 0) {
    raisons.push("Ton message contient un terme interdit par la charte du forum. Reformule-le poliment.");
  }
  if (!options.liensAutorises && liensTrouves(texte).some((lien) => !estLienInterne(lien, options.domaineSite))) {
    raisons.push("Les liens vers d'autres sites ne sont pas autorisés pour les élèves. Décris plutôt ta source.");
  }
  return { accepte: raisons.length === 0, raisons };
}
