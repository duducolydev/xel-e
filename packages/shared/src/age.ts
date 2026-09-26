export const AGE_CONSENTEMENT_PARENTAL = 15;

// Sans le jour de naissance, l'anniversaire compte une fois le mois passé : l'âge n'est jamais surestimé.
export function calculerAge(naissanceMois: number, naissanceAnnee: number, maintenant: Date): number {
  const annee = maintenant.getUTCFullYear();
  const mois = maintenant.getUTCMonth() + 1;
  const anniversairePasse = mois > naissanceMois;
  return annee - naissanceAnnee - (anniversairePasse ? 0 : 1);
}

export function exigeConsentementParental(
  naissanceMois: number,
  naissanceAnnee: number,
  maintenant: Date,
): boolean {
  return calculerAge(naissanceMois, naissanceAnnee, maintenant) < AGE_CONSENTEMENT_PARENTAL;
}
