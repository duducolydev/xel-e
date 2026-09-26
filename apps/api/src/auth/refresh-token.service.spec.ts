import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { RefreshToken } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import { DELAI_GRACE_REUTILISATION_MS, RefreshTokenService } from "./refresh-token.service";

type Filtre = Partial<Record<keyof RefreshToken, unknown>>;

function correspond(ligne: RefreshToken, filtre: Filtre): boolean {
  return Object.entries(filtre).every(([cle, valeur]) => ligne[cle as keyof RefreshToken] === valeur);
}

function creerFausseBase() {
  const lignes: RefreshToken[] = [];
  let compteur = 0;
  const refreshToken = {
    create: vi.fn(async ({ data }: { data: Omit<RefreshToken, "id" | "revoqueLe" | "remplaceParId" | "createdAt"> }) => {
      compteur += 1;
      const ligne: RefreshToken = {
        id: `rt-${compteur}`,
        revoqueLe: null,
        remplaceParId: null,
        createdAt: new Date(),
        ...data,
      };
      lignes.push(ligne);
      return ligne;
    }),
    findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
      lignes.find((ligne) => ligne.tokenHash === where.tokenHash) ?? null,
    ),
    updateMany: vi.fn(async ({ where, data }: { where: Filtre; data: Partial<RefreshToken> }) => {
      const cibles = lignes.filter((ligne) => correspond(ligne, where));
      cibles.forEach((ligne) => Object.assign(ligne, data));
      return { count: cibles.length };
    }),
    count: vi.fn(async ({ where }: { where: Filtre }) =>
      lignes.filter((ligne) => correspond(ligne, where)).length,
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<RefreshToken> }) => {
      const ligne = lignes.find((l) => l.id === where.id);
      if (!ligne) throw new Error("introuvable");
      return Object.assign(ligne, data);
    }),
  };
  const prisma = {
    refreshToken,
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ refreshToken })),
  } as unknown as PrismaService;
  return { prisma, lignes };
}

const config = {
  get: (cle: keyof Env) => ({ JWT_REFRESH_SECRET: "secret-de-test-assez-long", REFRESH_TTL_DAYS: 30 })[cle as string],
} as unknown as ConfigService<Env, true>;

describe("RefreshTokenService", () => {
  let service: RefreshTokenService;
  let lignes: RefreshToken[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
    const base = creerFausseBase();
    lignes = base.lignes;
    service = new RefreshTokenService(base.prisma, config);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("émet un jeton opaque dont seul le hash est stocké", async () => {
    const { token, expireLe } = await service.emettre("user-1");

    expect(token.length).toBeGreaterThan(30);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.tokenHash).not.toBe(token);
    expect(expireLe.toISOString()).toBe("2026-10-26T10:00:00.000Z");
  });

  it("fait tourner le jeton : l'ancien est révoqué, le nouveau reste dans la même famille", async () => {
    const { token } = await service.emettre("user-1");

    const tourne = await service.faireTourner(token);

    expect(tourne.userId).toBe("user-1");
    expect(tourne.token).not.toBe(token);
    expect(lignes).toHaveLength(2);
    expect(lignes[0]?.revoqueLe).not.toBeNull();
    expect(lignes[0]?.remplaceParId).toBe(lignes[1]?.id);
    expect(lignes[1]?.familleId).toBe(lignes[0]?.familleId);
    expect(lignes[1]?.revoqueLe).toBeNull();
  });

  it("détecte la réutilisation d'un jeton révoqué et révoque toute la famille", async () => {
    const { token: ancien } = await service.emettre("user-1");
    const { token: nouveau } = await service.faireTourner(ancien);

    vi.advanceTimersByTime(DELAI_GRACE_REUTILISATION_MS + 1000);

    await expect(service.faireTourner(ancien)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.faireTourner(nouveau)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(lignes.every((ligne) => ligne.revoqueLe !== null)).toBe(true);
  });

  it("tolère une réutilisation immédiate (requêtes parallèles) sans révoquer la famille", async () => {
    const { token: ancien } = await service.emettre("user-1");
    const { token: nouveau } = await service.faireTourner(ancien);

    vi.advanceTimersByTime(2000);
    const parallele = await service.faireTourner(ancien);

    expect(parallele.userId).toBe("user-1");
    await expect(service.faireTourner(nouveau)).resolves.toMatchObject({ userId: "user-1" });
  });

  it("refuse un jeton inconnu", async () => {
    await expect(service.faireTourner("inconnu")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuse un jeton expiré", async () => {
    const { token } = await service.emettre("user-1");

    vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000);

    await expect(service.faireTourner(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("invalide la session à la déconnexion (toute la famille), même immédiatement après", async () => {
    const { token: ancien } = await service.emettre("user-1");
    const { token: courant } = await service.faireTourner(ancien);

    await service.revoquerFamille(courant);

    await expect(service.faireTourner(courant)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.faireTourner(ancien)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("n'affecte pas les autres sessions à la déconnexion", async () => {
    const { token: telephone } = await service.emettre("user-1");
    const { token: ordinateur } = await service.emettre("user-1");

    await service.revoquerFamille(telephone);

    await expect(service.faireTourner(ordinateur)).resolves.toMatchObject({ userId: "user-1" });
  });

  it("révoque toutes les sessions d'un utilisateur (changement de mot de passe)", async () => {
    const { token: a } = await service.emettre("user-1");
    const { token: b } = await service.emettre("user-1");
    const { token: autre } = await service.emettre("user-2");

    await service.revoquerTout("user-1");

    await expect(service.faireTourner(a)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.faireTourner(b)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.faireTourner(autre)).resolves.toMatchObject({ userId: "user-2" });
  });

  it("ignore silencieusement la déconnexion d'un jeton inconnu", async () => {
    await expect(service.revoquerFamille("inconnu")).resolves.toBeUndefined();
  });
});
