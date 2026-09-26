import { ConflictException } from "@nestjs/common";
import type { StatutLecon } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  appliquerAction,
  estVisiblePublic,
  peutVoirCopieDeTravail,
  type ActionLecon,
} from "./workflow";

describe("machine à états des leçons", () => {
  const autorisees: [StatutLecon, ActionLecon, StatutLecon][] = [
    ["BROUILLON", "modifier", "BROUILLON"],
    ["BROUILLON", "soumettre", "EN_REVUE"],
    ["EN_REVUE", "renvoyerEnBrouillon", "BROUILLON"],
    ["EN_REVUE", "publier", "PUBLIE"],
    ["PUBLIE", "modifier", "BROUILLON"],
  ];

  it.each(autorisees)("%s + %s ⇒ %s", (statut, action, attendu) => {
    expect(appliquerAction(statut, action)).toBe(attendu);
  });

  const interdites: [StatutLecon, ActionLecon][] = [
    ["BROUILLON", "publier"],
    ["PUBLIE", "publier"],
    ["BROUILLON", "renvoyerEnBrouillon"],
    ["EN_REVUE", "soumettre"],
    ["EN_REVUE", "modifier"],
    ["PUBLIE", "soumettre"],
    ["PUBLIE", "renvoyerEnBrouillon"],
  ];

  it.each(interdites)("%s + %s ⇒ refusé (409)", (statut, action) => {
    expect(() => appliquerAction(statut, action)).toThrow(ConflictException);
  });

  it("seule une leçon EN_REVUE peut passer PUBLIE", () => {
    const statuts: StatutLecon[] = ["BROUILLON", "EN_REVUE", "PUBLIE"];
    const publiables = statuts.filter((statut) => {
      try {
        return appliquerAction(statut, "publier") === "PUBLIE";
      } catch {
        return false;
      }
    });
    expect(publiables).toEqual(["EN_REVUE"]);
  });
});

describe("politique d'accès aux contenus", () => {
  it("brouillons invisibles pour les non-admins", () => {
    expect(peutVoirCopieDeTravail("ELEVE")).toBe(false);
    expect(peutVoirCopieDeTravail("PARENT")).toBe(false);
    expect(peutVoirCopieDeTravail("PROFESSEUR")).toBe(false);
    expect(peutVoirCopieDeTravail(undefined)).toBe(false);
    expect(peutVoirCopieDeTravail("ADMIN")).toBe(true);
  });

  const publiee = { versionPublieeId: "v1", deletedAt: null, chapitre: { deletedAt: null } };

  it("une leçon jamais publiée n'est pas visible publiquement", () => {
    expect(estVisiblePublic({ ...publiee, versionPublieeId: null })).toBe(false);
  });

  it("une leçon publiée est visible de tous", () => {
    expect(estVisiblePublic(publiee)).toBe(true);
  });

  it("une leçon supprimée, ou dont le chapitre est supprimé, n'est plus visible", () => {
    expect(estVisiblePublic({ ...publiee, deletedAt: new Date() })).toBe(false);
    expect(estVisiblePublic({ ...publiee, chapitre: { deletedAt: new Date() } })).toBe(false);
  });
});
