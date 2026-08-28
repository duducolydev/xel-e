export const NIVEAUX = ["6e", "5e", "4e", "3e"] as const;

export type Niveau = (typeof NIVEAUX)[number];
