import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { TypeJetonVerification } from "@prisma/client";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { genererJeton, hasherJeton } from "./jetons";

const HEURE_MS = 60 * 60 * 1000;

export const DUREES_VALIDITE_MS: Record<TypeJetonVerification, number> = {
  CONFIRMATION_EMAIL: 48 * HEURE_MS,
  CONSENTEMENT_PARENTAL: 7 * 24 * HEURE_MS,
  REINITIALISATION_MOT_DE_PASSE: HEURE_MS,
};

export const LIEN_INVALIDE = "Ce lien est invalide ou a expiré.";

@Injectable()
export class JetonVerificationService {
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get("JWT_REFRESH_SECRET", { infer: true });
  }

  // Un nouveau jeton rend caducs les précédents du même type (dernier lien reçu = seul valide).
  async creer(userId: string, type: TypeJetonVerification): Promise<string> {
    const token = genererJeton();
    const maintenant = new Date();
    await this.prisma.$transaction([
      this.prisma.jetonVerification.updateMany({
        where: { userId, type, utiliseLe: null },
        data: { utiliseLe: maintenant },
      }),
      this.prisma.jetonVerification.create({
        data: {
          userId,
          type,
          tokenHash: hasherJeton(this.secret, token),
          expireLe: new Date(maintenant.getTime() + DUREES_VALIDITE_MS[type]),
        },
      }),
    ]);
    return token;
  }

  async consommer(token: string, type: TypeJetonVerification): Promise<string> {
    const jeton = await this.prisma.jetonVerification.findUnique({
      where: { tokenHash: hasherJeton(this.secret, token) },
    });
    const maintenant = new Date();
    if (!jeton || jeton.type !== type || jeton.utiliseLe || jeton.expireLe <= maintenant) {
      throw new BadRequestException(LIEN_INVALIDE);
    }
    const { count } = await this.prisma.jetonVerification.updateMany({
      where: { id: jeton.id, utiliseLe: null },
      data: { utiliseLe: maintenant },
    });
    if (count !== 1) throw new BadRequestException(LIEN_INVALIDE);
    return jeton.userId;
  }
}
