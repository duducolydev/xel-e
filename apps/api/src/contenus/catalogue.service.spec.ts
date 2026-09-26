import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { CatalogueService } from "./catalogue.service";

const publieLe = new Date("2026-09-26T10:00:00Z");

function versionLecon(titre: string) {
  return {
    id: "v-1",
    numero: 2,
    titre,
    resume: "Résumé",
    publieLe,
    sections: [{ titre: "Énoncé", html: "<p>…</p>" }],
  };
}

function creerService() {
  const prisma = {
    lecon: { groupBy: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    chapitre: { findMany: vi.fn() },
  };
  return { service: new CatalogueService(prisma as unknown as PrismaService), prisma };
}

describe("CatalogueService", () => {
  it("compte les leçons publiées par niveau et par matière", async () => {
    const { service, prisma } = creerService();
    prisma.lecon.groupBy.mockResolvedValue([
      { chapitreId: "c1", _count: { _all: 2 } },
      { chapitreId: "c2", _count: { _all: 3 } },
      { chapitreId: "orphelin", _count: { _all: 9 } },
    ]);
    prisma.chapitre.findMany.mockResolvedValue([
      { id: "c1", niveau: { libelle: "4e" }, matiere: { libelle: "Maths" } },
      { id: "c2", niveau: { libelle: "4e" }, matiere: { libelle: "Maths" } },
    ]);

    const niveaux = await service.niveaux();

    expect(niveaux.map((n) => n.niveau)).toEqual(["6e", "5e", "4e", "3e"]);
    const maths4e = niveaux[2]?.matieres.find((m) => m.libelle === "Maths");
    expect(maths4e).toEqual({ libelle: "Maths", slug: "maths", nom: "Mathématiques", nombreLecons: 5 });
    expect(niveaux[0]?.matieres.every((m) => m.nombreLecons === 0)).toBe(true);
  });

  it("montre une matière avec ses chapitres non vides et les titres publiés (pas ceux des brouillons)", async () => {
    const { service, prisma } = creerService();
    prisma.chapitre.findMany.mockResolvedValue([
      { titre: "Électricité", lecons: [{ slug: "loi-d-ohm", versionPubliee: { titre: "La loi d'Ohm" } }] },
      { titre: "Chapitre vide", lecons: [] },
    ]);

    const page = await service.matiere("3e", "pc");

    expect(page).toEqual({
      niveau: "3e",
      matiere: { libelle: "PC", slug: "pc", nom: "Physique-Chimie", nombreLecons: 1 },
      chapitres: [{ titre: "Électricité", lecons: [{ slug: "loi-d-ohm", titre: "La loi d'Ohm" }] }],
    });
  });

  it("renvoie 404 pour un niveau ou une matière inconnus", async () => {
    const { service } = creerService();

    await expect(service.matiere("2nde", "pc")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.matiere("3e", "histoire")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("sert la version en ligne avec ses leçons voisines dans le chapitre", async () => {
    const { service, prisma } = creerService();
    prisma.lecon.findFirst.mockResolvedValue({
      versionPubliee: versionLecon("Pythagore"),
      chapitre: {
        titre: "Le triangle rectangle",
        niveau: { libelle: "4e" },
        matiere: { libelle: "Maths" },
        lecons: [
          { slug: "vocabulaire", versionPubliee: { titre: "Vocabulaire" } },
          { slug: "pythagore", versionPubliee: { titre: "Pythagore" } },
          { slug: "reciproque", versionPubliee: { titre: "Réciproque" } },
        ],
      },
    });

    const { lecon, version } = await service.versionEnLigne("pythagore");

    expect(version.numero).toBe(2);
    expect(lecon).toMatchObject({
      slug: "pythagore",
      titre: "Pythagore",
      version: 2,
      publieLe: "2026-09-26T10:00:00.000Z",
      niveau: "4e",
      matiere: { slug: "maths", nom: "Mathématiques" },
      chapitre: "Le triangle rectangle",
      precedente: { slug: "vocabulaire", titre: "Vocabulaire" },
      suivante: { slug: "reciproque", titre: "Réciproque" },
    });
  });

  it("n'a pas de voisine avant la première leçon ni après la dernière", async () => {
    const { service, prisma } = creerService();
    prisma.lecon.findFirst.mockResolvedValue({
      versionPubliee: versionLecon("Seule"),
      chapitre: {
        titre: "C",
        niveau: { libelle: "6e" },
        matiere: { libelle: "SVT" },
        lecons: [{ slug: "seule", versionPubliee: { titre: "Seule" } }],
      },
    });

    const { lecon } = await service.versionEnLigne("seule");

    expect(lecon.precedente).toBeNull();
    expect(lecon.suivante).toBeNull();
  });

  it("renvoie 404 pour une leçon non publiée (le filtre public exclut les brouillons)", async () => {
    const { service, prisma } = creerService();
    prisma.lecon.findFirst.mockResolvedValue(null);

    await expect(service.versionEnLigne("brouillon")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.lecon.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      slug: "brouillon",
      versionPublieeId: { not: null },
      deletedAt: null,
    });
  });

  it("liste les leçons publiées pour le plan du site", async () => {
    const { service, prisma } = creerService();
    prisma.lecon.findMany.mockResolvedValue([
      {
        slug: "pythagore",
        versionPubliee: { publieLe },
        chapitre: { niveau: { libelle: "4e" }, matiere: { libelle: "Maths" } },
      },
    ]);

    await expect(service.planDuSite()).resolves.toEqual([
      { niveau: "4e", matiere: "maths", slug: "pythagore", publieLe: "2026-09-26T10:00:00.000Z" },
    ]);
  });
});
