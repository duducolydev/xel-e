// Offres insérées par la migration « paiements » et par le seed : prix PROVISOIRES (aConfirmer),
// à confirmer par l'administration (/admin/paiements).
export const PLANS_INITIAUX = [
  { id: "4f0f7f2e-7c3b-4d61-9a4e-1b2c3d4e5f60", code: "PREMIUM_MENSUEL", libelle: "Premium mensuel", prixFcfa: 1500, dureeMois: 1, ordre: 1 },
  { id: "4f0f7f2e-7c3b-4d61-9a4e-1b2c3d4e5f61", code: "PREMIUM_ANNUEL", libelle: "Premium annuel", prixFcfa: 15000, dureeMois: 12, ordre: 2 },
] as const;
