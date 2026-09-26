import { describe, expect, it } from "vitest";
import { calculerAge, exigeConsentementParental } from "./age";

const le = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("calculerAge", () => {
  it("compte l'anniversaire comme passé une fois le mois de naissance terminé", () => {
    expect(calculerAge(3, 2011, le("2026-04-01"))).toBe(15);
  });

  it("ne compte pas l'anniversaire pendant le mois de naissance (jour inconnu)", () => {
    expect(calculerAge(3, 2011, le("2026-03-31"))).toBe(14);
  });

  it("ne compte pas l'anniversaire avant le mois de naissance", () => {
    expect(calculerAge(10, 2011, le("2026-09-26"))).toBe(14);
  });
});

describe("exigeConsentementParental", () => {
  it("l'exige en dessous de 15 ans", () => {
    expect(exigeConsentementParental(10, 2012, le("2026-09-26"))).toBe(true);
  });

  it("ne l'exige plus à 15 ans révolus", () => {
    expect(exigeConsentementParental(1, 2011, le("2026-09-26"))).toBe(false);
  });

  it("cesse de l'exiger quand l'élève grandit", () => {
    expect(exigeConsentementParental(6, 2012, le("2027-06-15"))).toBe(true);
    expect(exigeConsentementParental(6, 2012, le("2027-07-01"))).toBe(false);
  });
});
