import { BadRequestException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { JetonVerification } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import { JetonVerificationService } from "./jeton-verification.service";

type Filtre = Partial<Record<keyof JetonVerification, unknown>>;

function creerFausseBase() {
  const lignes: JetonVerification[] = [];
  const correspond = (ligne: JetonVerification, filtre: Filtre) =>
    Object.entries(filtre).every(([cle, valeur]) => ligne[cle as keyof JetonVerification] === valeur);
  const jetonVerification = {
    create: vi.fn((args: { data: Omit<JetonVerification, "id" | "utiliseLe" | "createdAt"> }) => {
      const ligne = { id: `j-${lignes.length + 1}`, utiliseLe: null, createdAt: new Date(), ...args.data };
      lignes.push(ligne);
      return Promise.resolve(ligne);
    }),
    updateMany: vi.fn((args: { where: Filtre; data: Partial<JetonVerification> }) => {
      const cibles = lignes.filter((ligne) => correspond(ligne, args.where));
      cibles.forEach((ligne) => Object.assign(ligne, args.data));
      return Promise.resolve({ count: cibles.length });
    }),
    findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
      lignes.find((ligne) => ligne.tokenHash === where.tokenHash) ?? null,
    ),
  };
  const prisma = {
    jetonVerification,
    $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  } as unknown as PrismaService;
  return prisma;
}

const config = { get: () => "secret-de-test-assez-long" } as unknown as ConfigService<Env, true>;

describe("JetonVerificationService", () => {
  let service: JetonVerificationService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
    service = new JetonVerificationService(creerFausseBase(), config);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("consomme un jeton valide une seule fois", async () => {
    const token = await service.creer("user-1", "CONFIRMATION_EMAIL");

    await expect(service.consommer(token, "CONFIRMATION_EMAIL")).resolves.toBe("user-1");
    await expect(service.consommer(token, "CONFIRMATION_EMAIL")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse un jeton d'un autre type", async () => {
    const token = await service.creer("user-1", "CONFIRMATION_EMAIL");

    await expect(service.consommer(token, "REINITIALISATION_MOT_DE_PASSE")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("refuse un lien de réinitialisation après 1 heure", async () => {
    const token = await service.creer("user-1", "REINITIALISATION_MOT_DE_PASSE");

    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    await expect(service.consommer(token, "REINITIALISATION_MOT_DE_PASSE")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("laisse 7 jours au parent pour donner son accord", async () => {
    const token = await service.creer("user-1", "CONSENTEMENT_PARENTAL");

    vi.advanceTimersByTime(6 * 24 * 60 * 60 * 1000);

    await expect(service.consommer(token, "CONSENTEMENT_PARENTAL")).resolves.toBe("user-1");
  });

  it("rend caduc l'ancien lien quand un nouveau est demandé", async () => {
    const ancien = await service.creer("user-1", "REINITIALISATION_MOT_DE_PASSE");
    const nouveau = await service.creer("user-1", "REINITIALISATION_MOT_DE_PASSE");

    await expect(service.consommer(ancien, "REINITIALISATION_MOT_DE_PASSE")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.consommer(nouveau, "REINITIALISATION_MOT_DE_PASSE")).resolves.toBe("user-1");
  });

  it("refuse un jeton inconnu", async () => {
    await expect(service.consommer("inconnu", "CONFIRMATION_EMAIL")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
