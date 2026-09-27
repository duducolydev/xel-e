import { describe, expect, it, vi } from "vitest";
import type Redis from "ioredis";
import type { PrismaService } from "../prisma/prisma.service";
import { FENETRE_VUE_S, VuesService } from "./vues.service";

function creerService() {
  const dejaVus = new Set<string>();
  const redis = {
    set: vi.fn(async (cle: string) => {
      if (dejaVus.has(cle)) return null;
      dejaVus.add(cle);
      return "OK";
    }),
  };
  const prisma = {
    lecon: {
      findFirst: vi.fn().mockResolvedValue({ id: "lecon-1" }),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
  return {
    service: new VuesService(prisma as unknown as PrismaService, redis as unknown as Redis),
    prisma,
    redis,
  };
}

describe("VuesService", () => {
  it("compte une vue par visiteur et par heure", async () => {
    const { service, prisma, redis } = creerService();

    await service.enregistrer("pythagore", "203.0.113.7", "Firefox");
    await service.enregistrer("pythagore", "203.0.113.7", "Firefox");
    await service.enregistrer("pythagore", "203.0.113.7", "Chrome");

    expect(prisma.lecon.update).toHaveBeenCalledTimes(2);
    expect(prisma.lecon.update).toHaveBeenCalledWith({ where: { id: "lecon-1" }, data: { vues: { increment: 1 } } });
    expect(redis.set.mock.calls[0]).toEqual([expect.stringMatching(/^vue:lecon-1:[a-f0-9]{32}$/), "1", "EX", FENETRE_VUE_S, "NX"]);
  });

  it("ne garde jamais l'adresse IP en clair", async () => {
    const { service, redis } = creerService();

    await service.enregistrer("pythagore", "203.0.113.7", "Firefox");

    expect(JSON.stringify(redis.set.mock.calls)).not.toContain("203.0.113.7");
  });

  it("ignore les leçons non publiées", async () => {
    const { service, prisma, redis } = creerService();
    prisma.lecon.findFirst.mockResolvedValue(null);

    await service.enregistrer("brouillon", "203.0.113.7", "Firefox");

    expect(redis.set).not.toHaveBeenCalled();
    expect(prisma.lecon.update).not.toHaveBeenCalled();
  });

  it("sans Redis, ne compte pas (plutôt que de gonfler les chiffres)", async () => {
    const { service, prisma, redis } = creerService();
    redis.set.mockRejectedValue(new Error("connexion refusée"));

    await expect(service.enregistrer("pythagore", "203.0.113.7", "Firefox")).resolves.toBeUndefined();
    expect(prisma.lecon.update).not.toHaveBeenCalled();
  });
});
