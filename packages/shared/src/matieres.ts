export const MATIERES = ["Maths", "PC", "SVT"] as const;

export type Matiere = (typeof MATIERES)[number];

export interface InfoMatiere {
  libelle: Matiere;
  slug: string;
  nom: string;
}

export const INFOS_MATIERES: Record<Matiere, InfoMatiere> = {
  Maths: { libelle: "Maths", slug: "maths", nom: "Mathématiques" },
  PC: { libelle: "PC", slug: "pc", nom: "Physique-Chimie" },
  SVT: { libelle: "SVT", slug: "svt", nom: "Sciences de la Vie et de la Terre" },
};

export function matiereParSlug(slug: string): InfoMatiere | undefined {
  return Object.values(INFOS_MATIERES).find((info) => info.slug === slug);
}

export function slugifier(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
