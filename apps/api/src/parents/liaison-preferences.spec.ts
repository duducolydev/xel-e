import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import type Redis from "ioredis";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ActiviteService } from "./activite.service";
import { hacherCode } from "./code-liaison";
import { LiaisonService } from "./liaison.service";
import { PREFERENCES_PAR_DEFAUT, PreferencesService } from "./preferences.service";

const SECRET = "secret-de-test-assez-long";
const config = { get: () => SECRET } as unknown as ConfigService<Env, true>;
const MAINTENANT = new Date("2026-10-07T10:00:00Z");

function creerLiaison() {
  const prisma = {
    user: { findFirst: vi.fn().mockResolvedValue({ id: "eleve-1" }), updateMany: vi.fn() },
    codeLiaison: {
      updateMany: vi.fn((args: unknown) => ({ op: "updateMany", args })),
      create: vi.fn((args: unknown) => ({ op: "create", args })),
      findUnique: vi.fn(),
    },
    parentLink: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(2),
    },
    $transaction: vi.fn(async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : arg)),
  };
  const notifications = { notifier: vi.fn() };
  const service = new LiaisonService(prisma as unknown as PrismaService, notifications as unknown as NotificationsService, config);
  return { service, prisma, notifications };
}

const codeValide = (surcharge: Record<string, unknown> = {}) => ({
  id: "code-1",
  eleveId: "eleve-1",
  expireLe: new Date(MAINTENANT.getTime() + 3600_000),
  utiliseLe: null,
  eleve: { id: "eleve-1", nomComplet: "Fatou Diop", deletedAt: null, niveau: { libelle: "3e" } },
  ...surcharge,
});

describe("LiaisonService", () => {
  it("génère un code valable 48 h et invalide le précédent", async () => {
    const { service, prisma } = creerLiaison();
    prisma.codeLiaison.updateMany.mockReturnValue({ count: 1 } as never);

    const { code, expireLe } = await service.generer("eleve-1", MAINTENANT);

    expect(expireLe).toBe("2026-10-09T10:00:00.000Z");
    expect(prisma.codeLiaison.updateMany.mock.calls[0]?.[0]).toEqual({
      where: { eleveId: "eleve-1", utiliseLe: null, expireLe: { gt: MAINTENANT } },
      data: { expireLe: MAINTENANT },
    });
    expect(prisma.codeLiaison.create.mock.calls[0]?.[0]).toEqual({
      data: { eleveId: "eleve-1", codeHash: hacherCode(code.replace("-", ""), SECRET), expireLe: new Date(expireLe) },
    });
  });

  it("refuse de générer un code pour un compte qui n'est pas un élève", async () => {
    const { service, prisma } = creerLiaison();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.generer("parent-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lie le parent à l'enfant, consomme le code et prévient l'élève", async () => {
    const { service, prisma, notifications } = creerLiaison();
    prisma.codeLiaison.findUnique.mockResolvedValue(codeValide());
    prisma.codeLiaison.updateMany.mockResolvedValue({ count: 1 } as never);

    const enfant = await service.lier("parent-1", "k7pm-3xq9", MAINTENANT);

    expect(enfant).toEqual({ id: "eleve-1", nomComplet: "Fatou Diop", niveau: "3e" });
    expect(prisma.codeLiaison.findUnique.mock.calls[0]?.[0].where).toEqual({ codeHash: hacherCode("K7PM3XQ9", SECRET) });
    expect(prisma.codeLiaison.updateMany).toHaveBeenCalledWith({
      where: { id: "code-1", utiliseLe: null, expireLe: { gt: MAINTENANT } },
      data: { utiliseLe: MAINTENANT },
    });
    expect(prisma.parentLink.create).toHaveBeenCalledWith({ data: { parentId: "parent-1", enfantId: "eleve-1" } });
    expect(notifications.notifier).toHaveBeenCalledWith(["eleve-1"], "PARENT", expect.stringContaining("Un parent"));
  });

  it.each([
    ["mal formé", null, "abc"],
    ["inconnu", null, "K7PM-3XQ9"],
    ["expiré", codeValide({ expireLe: MAINTENANT }), "K7PM-3XQ9"],
    ["déjà utilisé", codeValide({ utiliseLe: new Date("2026-10-06T10:00:00Z") }), "K7PM-3XQ9"],
    ["d'un élève supprimé", codeValide({ eleve: { id: "eleve-1", nomComplet: "X", deletedAt: new Date(), niveau: null } }), "K7PM-3XQ9"],
  ])("refuse un code %s (400)", async (_cas, trouve, saisie) => {
    const { service, prisma } = creerLiaison();
    prisma.codeLiaison.findUnique.mockResolvedValue(trouve);

    await expect(service.lier("parent-1", saisie, MAINTENANT)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.parentLink.create).not.toHaveBeenCalled();
  });

  it("usage unique sous concurrence : un second parent avec le même code est refusé", async () => {
    const { service, prisma } = creerLiaison();
    prisma.codeLiaison.findUnique.mockResolvedValue(codeValide());
    prisma.codeLiaison.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(service.lier("parent-2", "K7PM-3XQ9", MAINTENANT)).rejects.toThrow(/invalide ou a expiré/);
    expect(prisma.parentLink.create).not.toHaveBeenCalled();
  });

  it("409 si l'enfant est déjà lié, sans consommer le code", async () => {
    const { service, prisma } = creerLiaison();
    prisma.codeLiaison.findUnique.mockResolvedValue(codeValide());
    prisma.parentLink.findUnique.mockResolvedValue({ id: "lien" });

    await expect(service.lier("parent-1", "K7PM-3XQ9", MAINTENANT)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.codeLiaison.updateMany).not.toHaveBeenCalled();
  });

  it("409 si la liaison est créée entre-temps par une autre requête", async () => {
    const { service, prisma } = creerLiaison();
    prisma.codeLiaison.findUnique.mockResolvedValue(codeValide());
    prisma.codeLiaison.updateMany.mockResolvedValue({ count: 1 } as never);
    prisma.parentLink.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "5" }));

    await expect(service.lier("parent-1", "K7PM-3XQ9", MAINTENANT)).rejects.toBeInstanceOf(ConflictException);
  });

  it("un parent non lié reçoit 403", async () => {
    const { service } = creerLiaison();

    await expect(service.verifierLien("parent-1", "eleve-2")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.delier("parent-1", "eleve-2")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.donnerAccord("parent-1", "eleve-2")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("le parent lié peut donner l'accord parental (une seule fois) et se délier", async () => {
    const { service, prisma } = creerLiaison();
    prisma.parentLink.findUnique.mockResolvedValue({ id: "lien" });

    await service.donnerAccord("parent-1", "eleve-1", MAINTENANT);
    await service.delier("parent-1", "eleve-1");

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "eleve-1", consentementParentalLe: null },
      data: { consentementParentalLe: MAINTENANT },
    });
    expect(prisma.parentLink.delete).toHaveBeenCalled();
  });

  it("liste les enfants liés (multi-enfants) et compte les parents d'un élève", async () => {
    const { service, prisma } = creerLiaison();
    prisma.parentLink.findMany.mockResolvedValue([
      { enfant: { id: "e1", nomComplet: "Fatou Diop", niveau: { libelle: "3e" } } },
      { enfant: { id: "e2", nomComplet: "Ali Diop", niveau: null } },
    ]);

    expect(await service.enfants("parent-1")).toEqual([
      { id: "e1", nomComplet: "Fatou Diop", niveau: "3e" },
      { id: "e2", nomComplet: "Ali Diop", niveau: null },
    ]);
    expect(await service.nombreDeParents("e1")).toBe(2);
  });
});

describe("PreferencesService et désinscription", () => {
  function creerPreferences() {
    const prisma = {
      preferencesParent: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
      user: { findFirst: vi.fn().mockResolvedValue({ id: "parent-1" }) },
    };
    return { service: new PreferencesService(prisma as unknown as PrismaService, config), prisma };
  }

  it("par défaut : résumé hebdomadaire par email", async () => {
    const { service } = creerPreferences();

    expect(await service.lire("parent-1")).toEqual(PREFERENCES_PAR_DEFAUT);
    expect(PREFERENCES_PAR_DEFAUT).toMatchObject({ frequence: "HEBDOMADAIRE", email: true, whatsapp: false, sms: false });
  });

  it("enregistre canaux, fréquence et téléphone", async () => {
    const { service, prisma } = creerPreferences();
    const dto = { frequence: "MENSUELLE" as const, email: false, whatsapp: true, sms: false, telephone: "+221771234567" };
    prisma.preferencesParent.findUnique.mockResolvedValue({ ...dto, id: "p", parentId: "parent-1", updatedAt: new Date() });

    expect(await service.modifier("parent-1", dto)).toEqual(dto);
    expect(prisma.preferencesParent.upsert.mock.calls[0]?.[0]).toMatchObject({ where: { parentId: "parent-1" }, update: dto });
  });

  it("le lien de désinscription passe la fréquence à « aucune », sans connexion", async () => {
    const { service, prisma } = creerPreferences();

    await service.desinscrire(service.jetonDesinscription("parent-1"));

    expect(prisma.preferencesParent.upsert.mock.calls[0]?.[0]).toMatchObject({
      where: { parentId: "parent-1" },
      update: { frequence: "AUCUNE" },
      create: { parentId: "parent-1", frequence: "AUCUNE" },
    });
  });

  it.each([
    ["sans signature", "parent-1"],
    ["signature falsifiée", "parent-1.AAAA"],
    ["signature d'un autre parent", () => "parent-2.x"],
  ])("refuse un jeton %s", async (_cas, jeton) => {
    const { service, prisma } = creerPreferences();
    const valeur = typeof jeton === "function" ? `parent-2.${service.jetonDesinscription("parent-1").split(".")[1]}` : jeton;

    await expect(service.desinscrire(valeur)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.preferencesParent.upsert).not.toHaveBeenCalled();
  });

  it("refuse un jeton valide pour un compte qui n'est (plus) pas parent", async () => {
    const { service, prisma } = creerPreferences();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.desinscrire(service.jetonDesinscription("eleve-1"))).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("ActiviteService (temps d'activité)", () => {
  function creerActivite() {
    const vues = new Set<string>();
    const redis = {
      set: vi.fn(async (cle: string) => {
        if (vues.has(cle)) return null;
        vues.add(cle);
        return "OK";
      }),
    };
    const prisma = { activiteJour: { upsert: vi.fn() } };
    return {
      service: new ActiviteService(prisma as unknown as PrismaService, redis as unknown as Redis),
      prisma,
      redis,
    };
  }

  it("compte une minute par signal, une seule fois même avec plusieurs onglets", async () => {
    const { service, prisma } = creerActivite();

    await service.signalerPresence("eleve-1", new Date("2026-10-07T23:59:10Z"));
    await service.signalerPresence("eleve-1", new Date("2026-10-07T23:59:40Z"));
    await service.signalerPresence("eleve-1", new Date("2026-10-08T00:00:05Z"));

    expect(prisma.activiteJour.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.activiteJour.upsert.mock.calls.map((c) => c[0].where.utilisateurId_jour.jour)).toEqual(["2026-10-07", "2026-10-08"]);
    expect(prisma.activiteJour.upsert.mock.calls[0]?.[0]).toMatchObject({
      update: { minutes: { increment: 1 } },
      create: { utilisateurId: "eleve-1", jour: "2026-10-07", minutes: 1 },
    });
  });

  it("sans Redis, ne compte rien plutôt que de compter en double", async () => {
    const { service, prisma, redis } = creerActivite();
    redis.set.mockRejectedValue(new Error("connexion refusée"));

    await expect(service.signalerPresence("eleve-1")).resolves.toBeUndefined();
    expect(prisma.activiteJour.upsert).not.toHaveBeenCalled();
  });
});
