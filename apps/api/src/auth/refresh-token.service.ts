import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { genererJeton, hasherJeton } from "./jetons";

// Deux requêtes parallèles (onglets, préchargement) peuvent présenter le même jeton juste après sa
// rotation : dans cette fenêtre ce n'est pas un vol, on ne révoque pas toute la famille.
export const DELAI_GRACE_REUTILISATION_MS = 30_000;

const JOUR_MS = 24 * 60 * 60 * 1000;

export interface RefreshEmis {
  token: string;
  expireLe: Date;
}

export interface RefreshTourne extends RefreshEmis {
  userId: string;
}

type Issue = { ok: true; resultat: RefreshTourne } | { ok: false };

const SESSION_INVALIDE = "Ta session a expiré. Reconnecte-toi.";

@Injectable()
export class RefreshTokenService {
  private readonly secret: string;
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get("JWT_REFRESH_SECRET", { infer: true });
    this.ttlMs = config.get("REFRESH_TTL_DAYS", { infer: true }) * JOUR_MS;
  }

  async emettre(userId: string, familleId: string = randomUUID()): Promise<RefreshEmis> {
    const token = genererJeton();
    const expireLe = new Date(Date.now() + this.ttlMs);
    await this.prisma.refreshToken.create({
      data: { userId, familleId, tokenHash: hasherJeton(this.secret, token), expireLe },
    });
    return { token, expireLe };
  }

  async faireTourner(token: string): Promise<RefreshTourne> {
    const tokenHash = hasherJeton(this.secret, token);
    const issue = await this.prisma.$transaction(async (tx): Promise<Issue> => {
      const existant = await tx.refreshToken.findUnique({ where: { tokenHash } });
      const maintenant = new Date();
      if (!existant || existant.expireLe <= maintenant) return { ok: false };

      if (existant.revoqueLe) {
        // Grâce réservée aux jetons remplacés par rotation dont la famille est toujours active :
        // un jeton révoqué par déconnexion ou changement de mot de passe n'est jamais accepté.
        const ecart = maintenant.getTime() - existant.revoqueLe.getTime();
        const dansGrace =
          ecart <= DELAI_GRACE_REUTILISATION_MS &&
          existant.remplaceParId !== null &&
          (await tx.refreshToken.count({
            where: { familleId: existant.familleId, revoqueLe: null },
          })) > 0;
        if (!dansGrace) {
          await tx.refreshToken.updateMany({
            where: { familleId: existant.familleId, revoqueLe: null },
            data: { revoqueLe: maintenant },
          });
          return { ok: false };
        }
      } else {
        await tx.refreshToken.updateMany({
          where: { id: existant.id, revoqueLe: null },
          data: { revoqueLe: maintenant },
        });
      }

      const nouveau = genererJeton();
      const expireLe = new Date(maintenant.getTime() + this.ttlMs);
      const cree = await tx.refreshToken.create({
        data: {
          userId: existant.userId,
          familleId: existant.familleId,
          tokenHash: hasherJeton(this.secret, nouveau),
          expireLe,
        },
      });
      if (!existant.remplaceParId) {
        await tx.refreshToken.update({
          where: { id: existant.id },
          data: { remplaceParId: cree.id },
        });
      }
      return { ok: true, resultat: { userId: existant.userId, token: nouveau, expireLe } };
    });

    if (!issue.ok) throw new UnauthorizedException(SESSION_INVALIDE);
    return issue.resultat;
  }

  async revoquerFamille(token: string): Promise<void> {
    const existant = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hasherJeton(this.secret, token) },
    });
    if (!existant) return;
    await this.prisma.refreshToken.updateMany({
      where: { familleId: existant.familleId, revoqueLe: null },
      data: { revoqueLe: new Date() },
    });
  }

  async revoquerTout(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoqueLe: null },
      data: { revoqueLe: new Date() },
    });
  }
}
