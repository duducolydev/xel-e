export const MATIERES = ["Maths", "PC", "SVT"] as const;

export type Matiere = (typeof MATIERES)[number];
