import { describe, expect, it } from "vitest";
import { calculerAccesForum, consentementParentalRequis, type ProfilAcces } from "./acces-forum";

const maintenant = new Date("2026-09-26T10:00:00Z");

function eleve(surcharges: Partial<ProfilAcces> = {}): ProfilAcces {
  return {
    role: "ELEVE",
    statutCompte: "ACTIF",
    email: null,
    emailConfirmeLe: null,
    naissanceMois: 1,
    naissanceAnnee: 2010,
    consentementParentalLe: null,
    ...surcharges,
  };
}

describe("règle mineur : accès au forum", () => {
  it("< 15 ans sans confirmation parentale ⇒ forumAccess = false", () => {
    expect(calculerAccesForum(eleve({ naissanceAnnee: 2013 }), maintenant)).toBe(false);
  });

  it("< 15 ans avec confirmation parentale ⇒ accès au forum", () => {
    const profil = eleve({ naissanceAnnee: 2013, consentementParentalLe: new Date() });
    expect(calculerAccesForum(profil, maintenant)).toBe(true);
  });

  it("15 ans ou plus ⇒ pas de consentement requis", () => {
    expect(consentementParentalRequis(eleve(), maintenant)).toBe(false);
    expect(calculerAccesForum(eleve(), maintenant)).toBe(true);
  });

  it("âge inconnu pour un élève ⇒ règle la plus protectrice", () => {
    const profil = eleve({ naissanceMois: null, naissanceAnnee: null });
    expect(consentementParentalRequis(profil, maintenant)).toBe(true);
    expect(calculerAccesForum(profil, maintenant)).toBe(false);
  });

  it("email renseigné mais non confirmé ⇒ pas d'accès au forum", () => {
    expect(calculerAccesForum(eleve({ email: "awa@xele.sn" }), maintenant)).toBe(false);
    expect(
      calculerAccesForum(eleve({ email: "awa@xele.sn", emailConfirmeLe: new Date() }), maintenant),
    ).toBe(true);
  });

  it("compte non actif ⇒ pas d'accès au forum", () => {
    const prof: ProfilAcces = { ...eleve(), role: "PROFESSEUR", statutCompte: "EN_ATTENTE_VALIDATION" };
    expect(calculerAccesForum(prof, maintenant)).toBe(false);
  });

  it("ne demande jamais de consentement parental hors élèves", () => {
    const parent: ProfilAcces = { ...eleve({ naissanceAnnee: 2013 }), role: "PARENT" };
    expect(consentementParentalRequis(parent, maintenant)).toBe(false);
  });
});
