import { describe, expect, it } from "vitest";
import { avancement, BADGES, badgesMerites, classer, type Statistiques } from "./regles";

const aucune: Statistiques = {
  leconsTerminees: 0,
  quizReussis: 0,
  quizParfaits: 0,
  chapitresCompletes: 0,
  serieRecord: 0,
};

describe("règles d'attribution des badges (chacune isolément)", () => {
  const cas: [string, Partial<Statistiques>, Partial<Statistiques>][] = [
    ["premiere-lecon", { leconsTerminees: 1 }, { leconsTerminees: 0 }],
    ["premier-quiz-reussi", { quizReussis: 1 }, { quizReussis: 0 }],
    ["sans-faute", { quizParfaits: 1 }, { quizParfaits: 0 }],
    ["chapitre-complete", { chapitresCompletes: 1 }, { chapitresCompletes: 0 }],
    ["serie-7-jours", { serieRecord: 7 }, { serieRecord: 6 }],
    ["dix-lecons", { leconsTerminees: 10 }, { leconsTerminees: 9 }],
  ];

  it.each(cas)("%s : attribué au seuil, pas juste en dessous", (code, auSeuil, sousLeSeuil) => {
    expect(badgesMerites({ ...aucune, ...auSeuil })).toContain(code);
    expect(badgesMerites({ ...aucune, ...sousLeSeuil })).not.toContain(code);
  });

  it("aucun badge sans activité", () => {
    expect(badgesMerites(aucune)).toEqual([]);
  });

  it("chaque badge du catalogue a une règle testée ci-dessus", () => {
    expect(BADGES.map((b) => b.code).sort()).toEqual(cas.map(([code]) => code).sort());
  });

  it("le badge de série dépend du record : il reste acquis quand la série retombe", () => {
    expect(badgesMerites({ ...aucune, serieRecord: 9 })).toContain("serie-7-jours");
  });
});

describe("agrégat de progression d'un chapitre = f(leçons terminées, quiz réussis)", () => {
  it("chapitre vide ⇒ 0 %, pas complet", () => {
    expect(avancement([])).toEqual({ pourcentage: 0, complet: false, leconsTerminees: 0, leconsTotal: 0 });
  });

  it("compte une étape par leçon terminée et une par quiz réussi", () => {
    const resultat = avancement([
      { terminee: true, aUnQuiz: true, quizReussi: true },
      { terminee: true, aUnQuiz: true, quizReussi: false },
      { terminee: false, aUnQuiz: true, quizReussi: false },
    ]);
    expect(resultat).toEqual({ pourcentage: 50, complet: false, leconsTerminees: 2, leconsTotal: 3 });
  });

  it("un quiz réussi sans avoir terminé la leçon compte aussi", () => {
    expect(avancement([{ terminee: false, aUnQuiz: true, quizReussi: true }]).pourcentage).toBe(50);
  });

  it("une leçon sans quiz ne compte qu'une étape", () => {
    expect(
      avancement([
        { terminee: true, aUnQuiz: false, quizReussi: false },
        { terminee: false, aUnQuiz: false, quizReussi: false },
      ]).pourcentage,
    ).toBe(50);
  });

  it("complet quand toutes les leçons sont terminées et tous leurs quiz réussis", () => {
    const chapitre = [
      { terminee: true, aUnQuiz: true, quizReussi: true },
      { terminee: true, aUnQuiz: false, quizReussi: false },
    ];
    expect(avancement(chapitre)).toMatchObject({ pourcentage: 100, complet: true });
  });

  it("arrondit le pourcentage", () => {
    expect(
      avancement([
        { terminee: true, aUnQuiz: true, quizReussi: false },
        { terminee: false, aUnQuiz: false, quizReussi: false },
      ]).pourcentage,
    ).toBe(33);
  });
});

describe("classement", () => {
  it("trie par XP décroissante, partage le rang en cas d'égalité", () => {
    const rangs = classer([
      { utilisateurId: "a", pseudonyme: "baobab", xp: 30 },
      { utilisateurId: "b", pseudonyme: "zebu", xp: 50 },
      { utilisateurId: "c", pseudonyme: "acacia", xp: 30 },
      { utilisateurId: "d", pseudonyme: "mangue", xp: 10 },
    ]).map((e) => [e.pseudonyme, e.rang]);

    expect(rangs).toEqual([
      ["zebu", 1],
      ["acacia", 2],
      ["baobab", 2],
      ["mangue", 4],
    ]);
  });
});
