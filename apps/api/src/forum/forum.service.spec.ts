import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import type Redis from "ioredis";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ForumService, MAX_MESSAGES_PAR_FENETRE } from "./forum.service";
import { ModerationService } from "./moderation.service";
import type { TermesService } from "./termes.service";

const ELEVE = {
  id: "eleve-1",
  role: "ELEVE",
  statutCompte: "ACTIF",
  email: null,
  emailConfirmeLe: null,
  naissanceMois: 1,
  naissanceAnnee: 2008,
  consentementParentalLe: null,
  pseudonyme: "awa_maths",
  niveau: { libelle: "3e" },
};

const conflit = () => new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "5" });

function creerForum() {
  let profil: Record<string, unknown> = { ...ELEVE };
  const compteurs = new Map<string, number>();
  const prisma = {
    user: {
      findUniqueOrThrow: vi.fn(async () => profil),
      update: vi.fn(),
    },
    niveau: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "niveau-3e" }) },
    matiere: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "matiere-maths" }) },
    sujetForum: {
      create: vi.fn().mockResolvedValue({ id: "sujet-1" }),
      findFirst: vi.fn().mockResolvedValue({ id: "sujet-1", auteurId: "prof-1", titre: "Thalès" }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    message: {
      create: vi.fn().mockResolvedValue({ id: "message-1", createdAt: new Date() }),
      findFirst: vi.fn().mockResolvedValue({ id: "message-1", auteurId: "autre", masque: false, verifieLe: null, deletedAt: null }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    pieceJointe: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    signalement: { create: vi.fn(), count: vi.fn().mockResolvedValue(1) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  const termes = { termes: vi.fn().mockResolvedValue(["connard"]) };
  const notifications = { notifier: vi.fn(), notifierAdmins: vi.fn() };
  const redis = {
    incr: vi.fn(async (cle: string) => {
      compteurs.set(cle, (compteurs.get(cle) ?? 0) + 1);
      return compteurs.get(cle)!;
    }),
    expire: vi.fn(),
  };
  const config = { get: () => "http://localhost:3010" } as unknown as ConfigService<Env, true>;
  const service = new ForumService(
    prisma as unknown as PrismaService,
    termes as unknown as TermesService,
    notifications as unknown as NotificationsService,
    redis as unknown as Redis,
    config,
  );
  // Après publication, ForumService relit le sujet : on le court-circuite pour isoler la logique.
  vi.spyOn(service, "sujet").mockResolvedValue({} as never);
  const changerProfil = (surcharge: Record<string, unknown>) => {
    profil = { ...profil, ...surcharge };
  };
  return { service, prisma, notifications, redis, changerProfil };
}

const SUJET = { niveau: "3e" as const, matiere: "Maths" as const, titre: "Aide sur Thalès", contenu: "Je bloque à l'exercice 3.", piecesJointes: [] };

describe("ForumService — accès et pseudonyme", () => {
  let forum: ReturnType<typeof creerForum>;
  beforeEach(() => {
    forum = creerForum();
  });

  it("ouvre le forum à un élève dont le compte remplit les conditions", async () => {
    expect(await forum.service.etat("eleve-1", new Date("2026-10-07"))).toEqual({
      acces: true,
      raison: null,
      pseudonyme: "awa_maths",
      niveau: "3e",
      liensAutorises: false,
    });
  });

  it("ferme le forum (lecture comprise) à un élève de moins de 15 ans sans accord parental", async () => {
    forum.changerProfil({ naissanceAnnee: 2014 });

    expect((await forum.service.etat("eleve-1")).raison).toMatch(/accord/);
    await expect(forum.service.page("eleve-1", "3e", "maths")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(forum.service.creerSujet("eleve-1", SUJET)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("ferme le forum tant que l'email n'est pas confirmé (plus de comptes anonymes)", async () => {
    forum.changerProfil({ email: "awa@example.sn", emailConfirmeLe: null });

    await expect(forum.service.page("eleve-1", "3e", "maths")).rejects.toThrow(/Confirme ton adresse email/);
  });

  it("le forum n'est pas ouvert aux parents", async () => {
    forum.changerProfil({ role: "PARENT" });

    expect((await forum.service.etat("eleve-1")).raison).toMatch(/réservé aux élèves et aux professeurs/);
  });

  it("exige un pseudonyme avant de publier", async () => {
    forum.changerProfil({ pseudonyme: null });

    await expect(forum.service.creerSujet("eleve-1", SUJET)).rejects.toThrow(/pseudonyme/);
  });

  it("refuse un pseudonyme déjà pris (409)", async () => {
    forum.prisma.user.update.mockRejectedValue(conflit());

    await expect(forum.service.definirPseudonyme("eleve-1", "pris")).rejects.toBeInstanceOf(ConflictException);
  });

  it("enregistre le pseudonyme choisi", async () => {
    await forum.service.definirPseudonyme("eleve-1", "nouveau_nom");

    expect(forum.prisma.user.update).toHaveBeenCalledWith({ where: { id: "eleve-1" }, data: { pseudonyme: "nouveau_nom" } });
  });

  it("renvoie 404 pour un niveau ou une matière inconnus", async () => {
    await expect(forum.service.page("eleve-1", "terminale", "maths")).rejects.toBeInstanceOf(NotFoundException);
    await expect(forum.service.page("eleve-1", "3e", "histoire")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ForumService — publication", () => {
  let forum: ReturnType<typeof creerForum>;
  beforeEach(() => {
    forum = creerForum();
  });

  it("crée le sujet et son premier message", async () => {
    await forum.service.creerSujet("eleve-1", SUJET);

    expect(forum.prisma.sujetForum.create.mock.calls[0]?.[0].data).toMatchObject({ titre: "Aide sur Thalès", auteurId: "eleve-1" });
    expect(forum.prisma.message.create.mock.calls[0]?.[0].data).toMatchObject({ sujetId: "sujet-1", contenu: "Je bloque à l'exercice 3." });
  });

  it("filtre le titre comme le message", async () => {
    await expect(forum.service.creerSujet("eleve-1", { ...SUJET, titre: "Ce connard de prof" })).rejects.toThrow(/terme interdit/);
    expect(forum.prisma.sujetForum.create).not.toHaveBeenCalled();
  });

  it("bloque les liens externes d'un élève, pas ceux d'un professeur", async () => {
    await expect(forum.service.repondre("eleve-1", "sujet-1", { contenu: "voir www.exemple.com", piecesJointes: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    forum.changerProfil({ role: "PROFESSEUR" });
    await forum.service.repondre("eleve-1", "sujet-1", { contenu: "voir www.exemple.com", piecesJointes: [] });
    expect(forum.prisma.message.create).toHaveBeenCalledTimes(1);
  });

  it("répondre remonte le sujet et prévient son auteur", async () => {
    await forum.service.repondre("eleve-1", "sujet-1", { contenu: "Utilise les rapports.", piecesJointes: [] });

    expect(forum.prisma.sujetForum.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "sujet-1" } }));
    expect(forum.notifications.notifier).toHaveBeenCalledWith(["prof-1"], "FORUM", "Nouvelle réponse à ton sujet « Thalès ».");
  });

  it("ne notifie pas l'auteur de sa propre réponse", async () => {
    forum.prisma.sujetForum.findFirst.mockResolvedValue({ id: "sujet-1", auteurId: "eleve-1", titre: "Thalès" });

    await forum.service.repondre("eleve-1", "sujet-1", { contenu: "Merci !", piecesJointes: [] });

    expect(forum.notifications.notifier).not.toHaveBeenCalled();
  });

  it("404 pour une réponse à un sujet retiré", async () => {
    forum.prisma.sujetForum.findFirst.mockResolvedValue(null);

    await expect(forum.service.repondre("eleve-1", "absent", { contenu: "Bonjour", piecesJointes: [] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rattache les pièces jointes de l'auteur, refuse celles d'un autre ou déjà utilisées", async () => {
    forum.prisma.pieceJointe.updateMany.mockResolvedValue({ count: 2 });
    await forum.service.repondre("eleve-1", "sujet-1", { contenu: "Ma figure", piecesJointes: ["pj-1", "pj-2", "pj-1"] });
    expect(forum.prisma.pieceJointe.updateMany.mock.calls[0]?.[0]).toEqual({
      where: { id: { in: ["pj-1", "pj-2"] }, auteurId: "eleve-1", messageId: null },
      data: { messageId: "message-1" },
    });

    forum.prisma.pieceJointe.updateMany.mockResolvedValue({ count: 0 });
    await expect(forum.service.repondre("eleve-1", "sujet-1", { contenu: "Volée", piecesJointes: ["pj-3"] })).rejects.toThrow(
      /introuvable ou déjà utilisée/,
    );
  });

  it(`limite à ${MAX_MESSAGES_PAR_FENETRE} messages par tranche de 10 minutes`, async () => {
    for (let i = 0; i < MAX_MESSAGES_PAR_FENETRE; i += 1) {
      await forum.service.repondre("eleve-1", "sujet-1", { contenu: `Message ${i}`, piecesJointes: [] });
    }
    await expect(forum.service.repondre("eleve-1", "sujet-1", { contenu: "Un de trop", piecesJointes: [] })).rejects.toBeInstanceOf(HttpException);
    expect(forum.redis.expire).toHaveBeenCalledTimes(1);
  });

  it("publie quand même si le limiteur (Redis) est indisponible", async () => {
    forum.redis.incr.mockRejectedValue(new Error("Redis indisponible"));

    await forum.service.repondre("eleve-1", "sujet-1", { contenu: "Bonjour", piecesJointes: [] });

    expect(forum.prisma.message.create).toHaveBeenCalled();
  });
});

describe("ForumService — signalements", () => {
  let forum: ReturnType<typeof creerForum>;
  beforeEach(() => {
    forum = creerForum();
  });

  it("enregistre un signalement sans masquer avant le 3e", async () => {
    forum.prisma.signalement.count.mockResolvedValue(2);

    expect(await forum.service.signaler("eleve-1", "message-1", "Moquerie")).toEqual({ masque: false });
    expect(forum.prisma.signalement.create).toHaveBeenCalledWith({ data: { messageId: "message-1", signalantId: "eleve-1", motif: "Moquerie" } });
    expect(forum.prisma.message.updateMany).not.toHaveBeenCalled();
  });

  it("masque au 3e signalement et prévient la modération une seule fois", async () => {
    forum.prisma.signalement.count.mockResolvedValue(3);

    expect(await forum.service.signaler("eleve-1", "message-1", undefined)).toEqual({ masque: true });
    expect(forum.prisma.message.updateMany.mock.calls[0]?.[0].where).toEqual({ id: "message-1", masque: false, verifieLe: null, deletedAt: null });
    expect(forum.notifications.notifierAdmins).toHaveBeenCalledTimes(1);

    // Masqué entre-temps par une requête concurrente : pas de seconde notification.
    forum.prisma.message.updateMany.mockResolvedValue({ count: 0 });
    await forum.service.signaler("eleve-1", "message-1", undefined);
    expect(forum.notifications.notifierAdmins).toHaveBeenCalledTimes(1);
  });

  it("un compte ne compte qu'une fois (second signalement sans effet)", async () => {
    forum.prisma.signalement.create.mockRejectedValue(conflit());

    expect(await forum.service.signaler("eleve-1", "message-1", undefined)).toEqual({ masque: false });
    expect(forum.prisma.signalement.count).not.toHaveBeenCalled();
  });

  it("ne masque plus automatiquement un message innocenté", async () => {
    forum.prisma.message.findFirst.mockResolvedValue({ id: "message-1", auteurId: "autre", masque: false, verifieLe: new Date(), deletedAt: null });
    forum.prisma.signalement.count.mockResolvedValue(3);

    expect(await forum.service.signaler("eleve-1", "message-1", undefined)).toEqual({ masque: false });
    expect(forum.prisma.message.updateMany).not.toHaveBeenCalled();
  });

  it("refuse de signaler son propre message ou un message retiré", async () => {
    forum.prisma.message.findFirst.mockResolvedValueOnce({ id: "message-1", auteurId: "eleve-1", masque: false, verifieLe: null, deletedAt: null });
    await expect(forum.service.signaler("eleve-1", "message-1", undefined)).rejects.toBeInstanceOf(BadRequestException);

    forum.prisma.message.findFirst.mockResolvedValueOnce(null);
    await expect(forum.service.signaler("eleve-1", "absent", undefined)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("relaie les autres erreurs d'enregistrement", async () => {
    forum.prisma.signalement.create.mockRejectedValue(new Error("base indisponible"));

    await expect(forum.service.signaler("eleve-1", "message-1", undefined)).rejects.toThrow("base indisponible");
  });
});

describe("ModerationService", () => {
  function creerModeration() {
    const prisma = {
      message: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({ id: "message-1", auteurId: "eleve-2", sujet: { titre: "Thalès" } }),
        update: vi.fn((args: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ op: "message.update", args })),
      },
      signalement: { updateMany: vi.fn((args: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ op: "signalement.updateMany", args })) },
      sujetForum: {
        findFirst: vi.fn().mockResolvedValue({ id: "sujet-1" }),
        update: vi.fn((args: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ op: "sujet.update", args })),
      },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    };
    const notifications = { notifier: vi.fn() };
    return {
      service: new ModerationService(prisma as unknown as PrismaService, notifications as unknown as NotificationsService),
      prisma,
      notifications,
    };
  }

  const brut = (id: string, surcharge: Record<string, unknown>) => ({
    id,
    contenu: `Texte ${id}`,
    createdAt: new Date("2026-10-07T08:00:00Z"),
    masque: false,
    verifieLe: null,
    deletedAt: null,
    sujet: { id: "sujet-1", titre: "Thalès" },
    auteur: { pseudonyme: "x", nomComplet: "Élève X", role: "ELEVE" },
    signalements: [{ motif: "insulte", createdAt: new Date("2026-10-07T09:00:00Z") }],
    piecesJointes: [],
    ...surcharge,
  });

  it("présente les messages masqués d'abord, puis les plus signalés", async () => {
    const { service, prisma } = creerModeration();
    const deux = [
      { motif: null, createdAt: new Date("2026-10-07T09:00:00Z") },
      { motif: "spam", createdAt: new Date("2026-10-07T09:30:00Z") },
    ];
    prisma.message.findMany.mockResolvedValue([
      brut("un-signalement", {}),
      brut("deux-signalements", { signalements: deux }),
      brut("masque", { masque: true, signalements: deux.slice(0, 1) }),
    ]);

    const file = await service.file();

    expect(file.map((e) => e.messageId)).toEqual(["masque", "deux-signalements", "un-signalement"]);
    expect(file[1]).toMatchObject({ signalements: 2, motifs: ["spam"], etat: "visible", verifie: false });
    expect(prisma.message.findMany.mock.calls[0]?.[0].where).toEqual({ deletedAt: null, signalements: { some: { traiteLe: null } } });
  });

  it("innocenter fait réapparaître le message, le protège et solde ses signalements", async () => {
    const { service, prisma } = creerModeration();

    await service.restaurer("message-1");

    expect(prisma.message.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "message-1" },
      data: { masque: false, masqueLe: null, verifieLe: expect.any(Date) },
    });
    expect(prisma.signalement.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { messageId: "message-1", traiteLe: null },
      data: { traiteLe: expect.any(Date) },
    });
  });

  it("supprimer retire le message, solde ses signalements et prévient son auteur", async () => {
    const { service, prisma, notifications } = creerModeration();

    await service.supprimer("message-1");

    expect(prisma.message.update.mock.calls[0]?.[0].data.deletedAt).toBeInstanceOf(Date);
    expect(notifications.notifier).toHaveBeenCalledWith(["eleve-2"], "MODERATION", expect.stringContaining("supprimé par la modération"));
  });

  it("404 pour un message déjà supprimé ou un sujet inconnu", async () => {
    const { service, prisma } = creerModeration();
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.sujetForum.findFirst.mockResolvedValue(null);

    await expect(service.restaurer("absent")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.supprimer("absent")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.supprimerSujet("absent")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("supprimer un sujet solde les signalements de tous ses messages", async () => {
    const { service, prisma } = creerModeration();

    await service.supprimerSujet("sujet-1");

    expect(prisma.signalement.updateMany.mock.calls[0]?.[0].where).toEqual({ message: { sujetId: "sujet-1" }, traiteLe: null });
  });
});

describe("ForumService — lecture", () => {
  it("liste les sujets d'un niveau et d'une matière, du plus actif au moins actif", async () => {
    const forum = creerForum();
    forum.prisma.sujetForum.findMany.mockResolvedValue([
      {
        id: "sujet-1",
        titre: "Thalès",
        createdAt: new Date("2026-10-07T08:00:00Z"),
        dernierMessageLe: new Date("2026-10-07T09:00:00Z"),
        auteur: { pseudonyme: "awa_maths", role: "ELEVE" },
        _count: { messages: 3 },
      },
    ]);

    const page = await forum.service.page("eleve-1", "3e", "maths");

    expect(forum.prisma.sujetForum.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { niveau: { libelle: "3e" }, matiere: { libelle: "Maths" }, deletedAt: null },
      orderBy: { dernierMessageLe: "desc" },
    });
    expect(page).toEqual({
      niveau: "3e",
      matiere: expect.objectContaining({ libelle: "Maths", slug: "maths" }),
      sujets: [
        {
          id: "sujet-1",
          titre: "Thalès",
          auteur: { pseudonyme: "awa_maths", badge: null },
          nombreReponses: 2,
          dernierMessageLe: "2026-10-07T09:00:00.000Z",
          createdAt: "2026-10-07T08:00:00.000Z",
        },
      ],
    });
  });

  it("présente un sujet avec ses messages sérialisés pour le lecteur", async () => {
    const forum = creerForum();
    vi.mocked(forum.service.sujet).mockRestore();
    forum.prisma.sujetForum.findFirst.mockResolvedValue({
      id: "sujet-1",
      titre: "Thalès",
      niveau: { libelle: "3e" },
      matiere: { libelle: "Maths" },
      auteur: { pseudonyme: "awa_maths", role: "ELEVE" },
      messages: [
        {
          id: "m-1",
          contenu: "Question",
          createdAt: new Date("2026-10-07T08:00:00Z"),
          auteurId: "eleve-1",
          auteur: { pseudonyme: "awa_maths", role: "ELEVE" },
          masque: false,
          verifieLe: null,
          deletedAt: null,
          piecesJointes: [],
          signalements: [],
        },
        {
          id: "m-2",
          contenu: "Réponse",
          createdAt: new Date("2026-10-07T08:30:00Z"),
          auteurId: "prof-1",
          auteur: { pseudonyme: "pr_moussa", role: "PROFESSEUR" },
          masque: false,
          verifieLe: null,
          deletedAt: null,
          piecesJointes: [],
          signalements: [{ signalantId: "eleve-1" }],
        },
      ],
    } as never);

    const sujet = await forum.service.sujet("eleve-1", "sujet-1");

    const requete = forum.prisma.sujetForum.findFirst.mock.calls[0]?.[0] as unknown as {
      include: { messages: { include: { signalements: unknown } } };
    };
    expect(requete.include.messages.include.signalements).toEqual({ where: { signalantId: "eleve-1" }, select: { signalantId: true } });
    expect(sujet).toMatchObject({
      titre: "Thalès",
      niveau: "3e",
      matiere: { slug: "maths" },
      messages: [
        { id: "m-1", estMoi: true, signaleParMoi: false },
        { id: "m-2", auteur: { pseudonyme: "pr_moussa", badge: "PROFESSEUR" }, estMoi: false, signaleParMoi: true },
      ],
    });
  });

  it("404 pour un sujet retiré", async () => {
    const forum = creerForum();
    vi.mocked(forum.service.sujet).mockRestore();
    forum.prisma.sujetForum.findFirst.mockResolvedValue(null);

    await expect(forum.service.sujet("eleve-1", "absent")).rejects.toBeInstanceOf(NotFoundException);
  });
});
