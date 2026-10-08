// Épreuves du BFEM insérées par la migration « bfem » et par le seed. Durées et coefficients sont
// PROVISOIRES (aVerifier = true) : l'administration saisit les valeurs officielles depuis l'interface.
// Seules Maths, PC et SVT ont des examens blancs sur Xel-E ; les autres servent à la simulation de moyenne.
export interface EpreuveInitiale {
  code: string;
  libelle: string;
  matiere: "Maths" | "PC" | "SVT" | null;
  dureeMinutes: number | null;
  coefficient: number;
}

export const EPREUVES_INITIALES: readonly EpreuveInitiale[] = [
  { code: "FRANCAIS", libelle: "Français", matiere: null, dureeMinutes: null, coefficient: 1 },
  { code: "MATHS", libelle: "Mathématiques", matiere: "Maths", dureeMinutes: 120, coefficient: 1 },
  { code: "PC", libelle: "Sciences physiques", matiere: "PC", dureeMinutes: 60, coefficient: 1 },
  { code: "SVT", libelle: "Sciences de la vie et de la Terre", matiere: "SVT", dureeMinutes: 60, coefficient: 1 },
  { code: "HISTOIRE_GEO", libelle: "Histoire-Géographie", matiere: null, dureeMinutes: null, coefficient: 1 },
  { code: "ANGLAIS", libelle: "Anglais", matiere: null, dureeMinutes: null, coefficient: 1 },
  { code: "LV2", libelle: "Deuxième langue", matiere: null, dureeMinutes: null, coefficient: 1 },
  { code: "EPS", libelle: "Éducation physique et sportive", matiere: null, dureeMinutes: null, coefficient: 1 },
];
