import { describe, expect, it } from "vitest";
import { agregerStatistiques, type DonneesLecon } from "./statistiques";

const lecon = (surcharge: Partial<DonneesLecon>): DonneesLecon => ({
  slug: "lecon",
  titre: "Leçon",
  vues: 0,
  tentatives: 0,
  reussies: 0,
  sommeScores: 0,
  ...surcharge,
});

describe("statistiques professeur", () => {
  it("calcule taux de réussite et score moyen par leçon", () => {
    const { lecons } = agregerStatistiques([
      lecon({ slug: "pythagore", titre: "Pythagore", vues: 120, tentatives: 4, reussies: 3, sommeScores: 310 }),
    ]);

    expect(lecons).toEqual([{ slug: "pythagore", titre: "Pythagore", vues: 120, tentatives: 4, tauxReussite: 75, scoreMoyen: 77.5 }]);
  });

  it("n'invente pas de taux quand personne n'a tenté le quiz", () => {
    const stats = agregerStatistiques([lecon({ vues: 12 })]);

    expect(stats.lecons[0]).toMatchObject({ tentatives: 0, tauxReussite: null, scoreMoyen: null });
    expect(stats.total).toEqual({ vues: 12, tentatives: 0, tauxReussite: null, scoreMoyen: null });
  });

  it("pondère les totaux par le nombre de tentatives (pas de moyenne des moyennes)", () => {
    const { total } = agregerStatistiques([
      lecon({ slug: "a", vues: 10, tentatives: 1, reussies: 1, sommeScores: 100 }),
      lecon({ slug: "b", vues: 30, tentatives: 9, reussies: 0, sommeScores: 90 }),
    ]);

    // Moyenne des moyennes : 55 % de réussite et 55 de score ; pondéré : 10 % et 19.
    expect(total).toEqual({ vues: 40, tentatives: 10, tauxReussite: 10, scoreMoyen: 19 });
  });

  it("arrondit au dixième", () => {
    const { lecons } = agregerStatistiques([lecon({ tentatives: 3, reussies: 1, sommeScores: 200 })]);

    expect(lecons[0]).toMatchObject({ tauxReussite: 33.3, scoreMoyen: 66.7 });
  });

  it("trie par vues décroissantes puis par titre", () => {
    const { lecons } = agregerStatistiques([
      lecon({ slug: "z", titre: "Zèbre", vues: 5 }),
      lecon({ slug: "e", titre: "Éclipse", vues: 5 }),
      lecon({ slug: "p", titre: "Populaire", vues: 50 }),
    ]);

    expect(lecons.map((l) => l.slug)).toEqual(["p", "e", "z"]);
  });

  it("sans leçon publiée, tout est à zéro", () => {
    expect(agregerStatistiques([])).toEqual({
      lecons: [],
      total: { vues: 0, tentatives: 0, tauxReussite: null, scoreMoyen: null },
    });
  });
});
