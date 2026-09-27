import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";

function creerService() {
  const prisma = {
    notification: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    user: { findMany: vi.fn().mockResolvedValue([{ id: "admin-1" }, { id: "admin-2" }]) },
  };
  return { service: new NotificationsService(prisma as unknown as PrismaService), prisma };
}

describe("NotificationsService", () => {
  it("crée une notification par destinataire", async () => {
    const { service, prisma } = creerService();

    await service.notifier(["u1", "u2"], "REVUE", "Ta leçon est publiée.");

    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        { utilisateurId: "u1", type: "REVUE", contenu: "Ta leçon est publiée." },
        { utilisateurId: "u2", type: "REVUE", contenu: "Ta leçon est publiée." },
      ],
    });
  });

  it("n'écrit rien sans destinataire", async () => {
    const { service, prisma } = creerService();

    await service.notifier([], "REVUE", "Personne");

    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("prévient les administrateurs actifs, sauf l'auteur de l'action", async () => {
    const { service, prisma } = creerService();

    await service.notifierAdmins("REVUE", "Nouvelle leçon à relire", "admin-3");

    expect(prisma.user.findMany.mock.calls[0]?.[0].where).toEqual({ role: "ADMIN", deletedAt: null, id: { not: "admin-3" } });
    expect(prisma.notification.createMany.mock.calls[0]?.[0].data).toHaveLength(2);
  });

  it("un échec d'enregistrement ne fait pas échouer l'action d'origine", async () => {
    const { service, prisma } = creerService();
    prisma.notification.createMany.mockRejectedValue(new Error("base indisponible"));
    prisma.user.findMany.mockRejectedValueOnce(new Error("base indisponible"));

    await expect(service.notifierAdmins("REVUE", "x")).resolves.toBeUndefined();
    await expect(service.notifier(["u1"], "REVUE", "x")).resolves.toBeUndefined();
  });

  it("renvoie les 10 dernières notifications et le nombre de non lues", async () => {
    const { service, prisma } = creerService();
    prisma.notification.findMany.mockResolvedValue([
      { id: "n1", contenu: "Publiée", lu: false, createdAt: new Date("2026-09-26T10:00:00Z") },
    ]);
    prisma.notification.count.mockResolvedValue(1);

    expect(await service.recentes("u1")).toEqual({
      notifications: [{ id: "n1", contenu: "Publiée", lu: false, createdAt: "2026-09-26T10:00:00.000Z" }],
      nonLues: 1,
    });
  });
});
