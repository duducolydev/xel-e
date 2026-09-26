import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { PublicationService } from "./publication.service";

const conflitUnicite = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "5" });

function creerService() {
  const prisma = {
    niveau: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "niveau-3e" }) },
    matiere: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "matiere-pc" }) },
    chapitre: {
      aggregate: vi.fn().mockResolvedValue({ _max: { ordre: 2 } }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "chapitre-1", ...data })),
      findFirst: vi.fn().mockResolvedValue({ id: "chapitre-1", deletedAt: null }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "chapitre-1", ...data })),
    },
    lecon: {
      aggregate: vi.fn().mockResolvedValue({ _max: { ordre: null } }),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "lecon-1", ...data })),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
  return { service: new PublicationService(prisma as unknown as PrismaService), prisma };
}

describe("PublicationService — chapitres", () => {
  it("place un nouveau chapitre après le dernier existant", async () => {
    const { service, prisma } = creerService();

    await service.creerChapitre({ niveau: "3e", matiere: "PC", titre: "Électricité" });

    expect(prisma.chapitre.create.mock.calls[0]?.[0].data).toEqual({
      niveauId: "niveau-3e",
      matiereId: "matiere-pc",
      titre: "Électricité",
      ordre: 3,
    });
  });

  it("respecte un ordre explicite", async () => {
    const { service, prisma } = creerService();

    await service.creerChapitre({ niveau: "3e", matiere: "PC", titre: "Optique", ordre: 7 });

    expect(prisma.chapitre.aggregate).not.toHaveBeenCalled();
    expect(prisma.chapitre.create.mock.calls[0]?.[0].data).toMatchObject({ ordre: 7 });
  });

  it("transforme un ordre déjà pris en 409", async () => {
    const { service, prisma } = creerService();
    prisma.chapitre.create.mockRejectedValueOnce(conflitUnicite());

    await expect(
      service.creerChapitre({ niveau: "3e", matiere: "PC", titre: "Optique", ordre: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("modifie et supprime (en douceur) un chapitre actif", async () => {
    const { service, prisma } = creerService();

    await service.modifierChapitre("chapitre-1", { titre: "Électricité (2)" });
    await service.supprimerChapitre("chapitre-1");

    expect(prisma.chapitre.update.mock.calls[1]?.[0].data.deletedAt).toBeInstanceOf(Date);
  });

  it("renvoie 404 pour un chapitre supprimé ou inconnu", async () => {
    const { service, prisma } = creerService();
    prisma.chapitre.findFirst.mockResolvedValue(null);

    await expect(service.modifierChapitre("absent", { titre: "X" })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.supprimerChapitre("absent")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("liste les chapitres d'un niveau et d'une matière, hors supprimés", async () => {
    const { service, prisma } = creerService();

    await service.listerChapitres("3e", "PC");

    expect(prisma.chapitre.findMany.mock.calls[0]?.[0].where).toEqual({
      niveau: { libelle: "3e" },
      matiere: { libelle: "PC" },
      deletedAt: null,
    });
  });
});

describe("PublicationService — création de leçon", () => {
  it("crée un brouillon en première position avec un slug tiré du titre", async () => {
    const { service, prisma } = creerService();

    await service.creerLecon({ chapitreId: "chapitre-1", titre: "La loi d'Ohm" }, "admin-1");

    expect(prisma.lecon.create.mock.calls[0]?.[0].data).toMatchObject({
      slug: "la-loi-d-ohm",
      ordre: 1,
      contenu: "",
      auteurId: "admin-1",
    });
  });

  it("ajoute un suffixe quand le slug existe déjà", async () => {
    const { service, prisma } = creerService();
    prisma.lecon.findUnique
      .mockResolvedValueOnce({ id: "autre" })
      .mockResolvedValueOnce({ id: "encore" })
      .mockResolvedValueOnce(null);

    await service.creerLecon({ chapitreId: "chapitre-1", titre: "La loi d'Ohm" }, "admin-1");

    expect(prisma.lecon.create.mock.calls[0]?.[0].data.slug).toBe("la-loi-d-ohm-3");
  });

  it("utilise « lecon » quand le titre ne donne aucun caractère exploitable", async () => {
    const { service, prisma } = creerService();

    await service.creerLecon({ chapitreId: "chapitre-1", titre: "« … »" }, "admin-1");

    expect(prisma.lecon.create.mock.calls[0]?.[0].data.slug).toBe("lecon");
  });

  it("refuse une leçon dans un chapitre supprimé", async () => {
    const { service, prisma } = creerService();
    prisma.chapitre.findFirst.mockResolvedValue(null);

    await expect(
      service.creerLecon({ chapitreId: "chapitre-1", titre: "La loi d'Ohm" }, "admin-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("renvoie 404 pour une leçon inconnue", async () => {
    const { service } = creerService();

    await expect(service.lecon("absente")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.supprimerLecon("absente")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.apercu("absente")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rend l'aperçu de la copie de travail et supprime en douceur", async () => {
    const { service, prisma } = creerService();
    prisma.lecon.findFirst.mockResolvedValue({ id: "lecon-1", contenu: "## Titre\nTexte" });

    const apercu = await service.apercu("lecon-1");
    await service.supprimerLecon("lecon-1");

    expect(apercu.sections[0]?.titre).toBe("Titre");
    expect(prisma.lecon.update.mock.calls[0]?.[0].data.deletedAt).toBeInstanceOf(Date);
  });
});
