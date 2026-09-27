import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { StatutLecon } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  appliquerAction,
  estVisiblePublic,
  peutVoirCopieDeTravail,
  verifierDroit,
  type Acteur,
  type ActionLecon,
} from "./workflow";

describe("machine à états des leçons", () => {
  const autorisees: [StatutLecon, ActionLecon, StatutLecon][] = [
    ["BROUILLON", "modifier", "BROUILLON"],
    ["BROUILLON", "soumettre", "EN_REVUE"],
    ["EN_REVUE", "rejeter", "BROUILLON"],
    ["EN_REVUE", "publier", "PUBLIE"],
    ["PUBLIE", "modifier", "BROUILLON"],
  ];

  it.each(autorisees)("%s + %s ⇒ %s", (statut, action, attendu) => {
    expect(appliquerAction(statut, action)).toBe(attendu);
  });

  const interdites: [StatutLecon, ActionLecon][] = [
    ["BROUILLON", "publier"],
    ["BROUILLON", "rejeter"],
    ["PUBLIE", "publier"],
    ["PUBLIE", "soumettre"],
    ["PUBLIE", "rejeter"],
    ["EN_REVUE", "soumettre"],
    ["EN_REVUE", "modifier"],
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

describe("droits sur le circuit de publication", () => {
  const prof: Acteur = { id: "prof-1", role: "PROFESSEUR" };
  const autreProf: Acteur = { id: "prof-2", role: "PROFESSEUR" };
  const admin: Acteur = { id: "admin-1", role: "ADMIN" };
  const saLecon = { auteurId: "prof-1" };

  it("un professeur peut modifier et soumettre sa leçon", () => {
    expect(() => verifierDroit(prof, "modifier", saLecon)).not.toThrow();
    expect(() => verifierDroit(prof, "soumettre", saLecon)).not.toThrow();
  });

  it("un professeur ne peut pas publier directement (403)", () => {
    expect(() => verifierDroit(prof, "publier", saLecon)).toThrow(ForbiddenException);
    expect(() => verifierDroit(prof, "publier", saLecon)).toThrow(/ne peut pas publier directement/);
  });

  it("un professeur ne peut pas refuser une leçon (403)", () => {
    expect(() => verifierDroit(prof, "rejeter", saLecon)).toThrow(ForbiddenException);
  });

  it("un professeur ne peut modifier que ses propres leçons (404 pour celles des autres)", () => {
    for (const action of ["modifier", "soumettre"] as const) {
      expect(() => verifierDroit(autreProf, action, saLecon)).toThrow(NotFoundException);
    }
  });

  it("un professeur ne touche pas aux leçons de l'administration", () => {
    expect(() => verifierDroit(prof, "modifier", { auteurId: null })).toThrow(NotFoundException);
  });

  it("l'administration peut tout faire sur toutes les leçons", () => {
    for (const action of ["modifier", "soumettre", "rejeter", "publier"] as const) {
      expect(() => verifierDroit(admin, action, saLecon)).not.toThrow();
    }
  });

  it("élèves et parents n'ont aucun droit d'écriture", () => {
    expect(() => verifierDroit({ id: "e", role: "ELEVE" }, "modifier", { auteurId: "e" })).toThrow(NotFoundException);
    expect(() => verifierDroit({ id: "p", role: "PARENT" }, "soumettre", { auteurId: "p" })).toThrow(NotFoundException);
  });
});

describe("politique d'accès aux contenus", () => {
  const brouillon = { auteurId: "prof-1" };

  it("brouillons invisibles pour les non-admins, sauf leur auteur", () => {
    expect(peutVoirCopieDeTravail(undefined, brouillon)).toBe(false);
    expect(peutVoirCopieDeTravail({ id: "eleve", role: "ELEVE" }, brouillon)).toBe(false);
    expect(peutVoirCopieDeTravail({ id: "parent", role: "PARENT" }, brouillon)).toBe(false);
    expect(peutVoirCopieDeTravail({ id: "prof-2", role: "PROFESSEUR" }, brouillon)).toBe(false);
    expect(peutVoirCopieDeTravail({ id: "prof-1", role: "PROFESSEUR" }, brouillon)).toBe(true);
    expect(peutVoirCopieDeTravail({ id: "admin", role: "ADMIN" }, brouillon)).toBe(true);
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
