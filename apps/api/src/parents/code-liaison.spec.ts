import { describe, expect, it } from "vitest";
import { ALPHABET_CODE, DUREE_CODE_MS, estUtilisable, genererCode, hacherCode, normaliserCode } from "./code-liaison";

describe("codes de liaison parent-enfant", () => {
  it("génère un code de 8 caractères lisibles, en deux blocs", () => {
    const code = genererCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(code).not.toMatch(/[01OIL]/);
  });

  it("tire chaque caractère dans l'alphabet sans ambiguïté", () => {
    const tirages = [0, 1, 2, 3, ALPHABET_CODE.length - 1, 5, 6, 7];
    expect(genererCode(() => tirages.shift()!)).toBe("ABCD-9FGH");
  });

  it("deux codes successifs diffèrent (tirage cryptographique)", () => {
    const codes = new Set(Array.from({ length: 200 }, () => genererCode()));
    expect(codes.size).toBe(200);
  });

  it("tolère minuscules, espaces et tirets à la saisie", () => {
    expect(normaliserCode(" k7pm-3xq9 ")).toBe("K7PM3XQ9");
    expect(normaliserCode("K7PM 3XQ9")).toBe("K7PM3XQ9");
  });

  it("rejette d'emblée un code mal formé", () => {
    expect(normaliserCode("K7PM-3XQ")).toBeNull();
    expect(normaliserCode("K7PM-3XQ0")).toBeNull();
    expect(normaliserCode("")).toBeNull();
  });

  it("ne stocke qu'une empreinte, qui dépend du secret du serveur", () => {
    expect(hacherCode("K7PM3XQ9", "secret-a")).toBe(hacherCode("K7PM3XQ9", "secret-a"));
    expect(hacherCode("K7PM3XQ9", "secret-a")).not.toBe(hacherCode("K7PM3XQ9", "secret-b"));
    expect(hacherCode("K7PM3XQ9", "secret-a")).not.toContain("K7PM3XQ9");
  });

  describe("validité (usage unique, 48 h)", () => {
    const cree = new Date("2026-10-07T10:00:00Z");
    const code = { expireLe: new Date(cree.getTime() + DUREE_CODE_MS), utiliseLe: null };

    it("dure 48 heures", () => {
      expect(DUREE_CODE_MS).toBe(48 * 3600 * 1000);
    });

    it("est utilisable jusqu'à l'expiration, exclue", () => {
      expect(estUtilisable(code, cree)).toBe(true);
      expect(estUtilisable(code, new Date(code.expireLe.getTime() - 1))).toBe(true);
      expect(estUtilisable(code, code.expireLe)).toBe(false);
      expect(estUtilisable(code, new Date(cree.getTime() + 49 * 3600 * 1000))).toBe(false);
    });

    it("ne sert qu'une fois", () => {
      expect(estUtilisable({ ...code, utiliseLe: cree }, cree)).toBe(false);
    });
  });
});
