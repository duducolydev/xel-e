import { describe, expect, it } from "vitest";
import { INFOS_MATIERES, matiereParSlug, slugifier } from "./matieres";

describe("slugifier", () => {
  it("retire les accents, met en minuscules et remplace les séparateurs", () => {
    expect(slugifier("Le théorème de Pythagore")).toBe("le-theoreme-de-pythagore");
  });

  it("ne garde ni tiret en début ou fin, ni tirets multiples", () => {
    expect(slugifier("  « Les fractions ! »  ")).toBe("les-fractions");
    expect(slugifier("Air & eau : états")).toBe("air-eau-etats");
  });

  it("limite la longueur sans finir par un tiret", () => {
    const slug = slugifier(`${"a".repeat(79)} b`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("matiereParSlug", () => {
  it("retrouve une matière par son slug d'URL", () => {
    expect(matiereParSlug("pc")).toBe(INFOS_MATIERES.PC);
  });

  it("renvoie undefined pour un slug inconnu", () => {
    expect(matiereParSlug("histoire")).toBeUndefined();
  });
});
