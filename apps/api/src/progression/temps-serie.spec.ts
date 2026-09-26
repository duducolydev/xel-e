import { describe, expect, it } from "vitest";
import { enregistrerJourActif, serieCourante, type EtatSerie } from "./serie";
import { debutSemaine, decalerJour, jourLocal } from "./temps";

const vierge: EtatSerie = { serieJours: 0, serieRecord: 0, dernierJourActif: null };

describe("jour calendaire selon le fuseau", () => {
  it("Africa/Dakar reste en UTC+0 : 23 h 30 UTC est encore le même jour à Dakar", () => {
    expect(jourLocal(new Date("2026-09-26T23:30:00Z"), "Africa/Dakar")).toBe("2026-09-26");
  });

  it("le fuseau est réellement pris en compte (à Paris, c'est déjà le lendemain)", () => {
    expect(jourLocal(new Date("2026-09-26T23:30:00Z"), "Europe/Paris")).toBe("2026-09-27");
  });

  it("change de jour à minuit heure de Dakar", () => {
    expect(jourLocal(new Date("2026-09-27T00:00:00Z"))).toBe("2026-09-27");
  });

  it("décale d'un jour y compris en changeant de mois ou d'année", () => {
    expect(decalerJour("2026-03-01", -1)).toBe("2026-02-28");
    expect(decalerJour("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("série de jours actifs", () => {
  it("démarre à 1 au premier jour actif", () => {
    expect(enregistrerJourActif(vierge, "2026-09-26")).toEqual({
      serieJours: 1,
      serieRecord: 1,
      dernierJourActif: "2026-09-26",
    });
  });

  it("même jour ⇒ pas d'incrément", () => {
    const jour1 = enregistrerJourActif(vierge, "2026-09-26");
    expect(enregistrerJourActif(jour1, "2026-09-26")).toEqual(jour1);
  });

  it("jour suivant ⇒ +1", () => {
    const jour1 = enregistrerJourActif(vierge, "2026-09-26");
    expect(enregistrerJourActif(jour1, "2026-09-27").serieJours).toBe(2);
  });

  it("jour manqué ⇒ remise à zéro (la série repart à 1), le record est conservé", () => {
    let etat = vierge;
    for (const jour of ["2026-09-20", "2026-09-21", "2026-09-22"]) etat = enregistrerJourActif(etat, jour);

    const apresTrou = enregistrerJourActif(etat, "2026-09-24");

    expect(apresTrou).toEqual({ serieJours: 1, serieRecord: 3, dernierJourActif: "2026-09-24" });
  });

  it("traverse les fins de mois", () => {
    const etat = enregistrerJourActif(enregistrerJourActif(vierge, "2026-09-30"), "2026-10-01");
    expect(etat.serieJours).toBe(2);
  });

  it("s'affiche tant que le dernier jour actif est aujourd'hui ou hier, 0 ensuite", () => {
    const etat: EtatSerie = { serieJours: 5, serieRecord: 5, dernierJourActif: "2026-09-25" };
    expect(serieCourante(etat, "2026-09-25")).toBe(5);
    expect(serieCourante(etat, "2026-09-26")).toBe(5);
    expect(serieCourante(etat, "2026-09-27")).toBe(0);
    expect(serieCourante(vierge, "2026-09-27")).toBe(0);
  });
});

describe("début de semaine (classement hebdomadaire)", () => {
  it("un samedi appartient à la semaine commencée le lundi précédent à 00:00, heure de Dakar", () => {
    expect(debutSemaine(new Date("2026-09-26T15:00:00Z")).toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("le lundi à 00:00 ouvre une nouvelle semaine ; le dimanche soir est encore la précédente", () => {
    expect(debutSemaine(new Date("2026-09-28T00:00:00Z")).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(debutSemaine(new Date("2026-09-27T23:59:00Z")).toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("respecte un autre fuseau (lundi 00:00 à Paris = dimanche 22:00 UTC en été)", () => {
    expect(debutSemaine(new Date("2026-09-26T15:00:00Z"), "Europe/Paris").toISOString()).toBe(
      "2026-09-20T22:00:00.000Z",
    );
  });
});
