import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import type { CodeLiaisonGenere, EnfantLie, Niveau } from "@xel-e/shared";
import type { Env } from "../config/env";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { DUREE_CODE_MS, estUtilisable, genererCode, hacherCode, normaliserCode } from "./code-liaison";

const CODE_INVALIDE = "Ce code est invalide ou a expiré. Demande à ton enfant d'en générer un nouveau.";

@Injectable()
export class LiaisonService {
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get("JWT_SECRET", { infer: true });
  }

  // Un seul code actif par élève : générer un nouveau code invalide le précédent.
  async generer(eleveId: string, maintenant = new Date()): Promise<CodeLiaisonGenere> {
    const eleve = await this.prisma.user.findFirst({ where: { id: eleveId, role: "ELEVE", deletedAt: null }, select: { id: true } });
    if (!eleve) throw new NotFoundException("Élève introuvable.");
    const code = genererCode();
    const expireLe = new Date(maintenant.getTime() + DUREE_CODE_MS);
    await this.prisma.$transaction([
      this.prisma.codeLiaison.updateMany({
        where: { eleveId, utiliseLe: null, expireLe: { gt: maintenant } },
        data: { expireLe: maintenant },
      }),
      this.prisma.codeLiaison.create({
        data: { eleveId, codeHash: hacherCode(code.replace("-", ""), this.secret), expireLe },
      }),
    ]);
    return { code, expireLe: expireLe.toISOString() };
  }

  async lier(parentId: string, saisie: string, maintenant = new Date()): Promise<EnfantLie> {
    const code = normaliserCode(saisie);
    if (!code) throw new BadRequestException(CODE_INVALIDE);
    const trouve = await this.prisma.codeLiaison.findUnique({
      where: { codeHash: hacherCode(code, this.secret) },
      include: { eleve: { select: { id: true, nomComplet: true, deletedAt: true, niveau: { select: { libelle: true } } } } },
    });
    if (!trouve || !estUtilisable(trouve, maintenant) || trouve.eleve.deletedAt) throw new BadRequestException(CODE_INVALIDE);

    const dejaLie = await this.prisma.parentLink.findUnique({
      where: { parentId_enfantId: { parentId, enfantId: trouve.eleveId } },
    });
    if (dejaLie) throw new ConflictException("Cet enfant est déjà lié à votre compte.");

    // Usage unique, même sous requêtes concurrentes : le code n'est consommé qu'une fois.
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.codeLiaison.updateMany({
        where: { id: trouve.id, utiliseLe: null, expireLe: { gt: maintenant } },
        data: { utiliseLe: maintenant },
      });
      if (count !== 1) throw new BadRequestException(CODE_INVALIDE);
      try {
        await tx.parentLink.create({ data: { parentId, enfantId: trouve.eleveId } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new ConflictException("Cet enfant est déjà lié à votre compte.");
        }
        throw error;
      }
    });
    await this.notifications.notifier(
      [trouve.eleveId],
      "PARENT",
      "Un parent vient de lier son compte au tien : il pourra suivre ta progression.",
    );
    return {
      id: trouve.eleve.id,
      nomComplet: trouve.eleve.nomComplet,
      niveau: (trouve.eleve.niveau?.libelle as Niveau | undefined) ?? null,
    };
  }

  async enfants(parentId: string): Promise<EnfantLie[]> {
    const liens = await this.prisma.parentLink.findMany({
      where: { parentId, enfant: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { enfant: { select: { id: true, nomComplet: true, niveau: { select: { libelle: true } } } } },
    });
    return liens.map(({ enfant }) => ({
      id: enfant.id,
      nomComplet: enfant.nomComplet,
      niveau: (enfant.niveau?.libelle as Niveau | undefined) ?? null,
    }));
  }

  // 403 (et non 404) : le brief demande qu'un parent non lié soit explicitement refusé.
  async verifierLien(parentId: string, enfantId: string): Promise<void> {
    const lien = await this.prisma.parentLink.findUnique({ where: { parentId_enfantId: { parentId, enfantId } } });
    if (!lien) throw new ForbiddenException("Vous n'êtes pas lié à cet élève.");
  }

  async delier(parentId: string, enfantId: string): Promise<void> {
    await this.verifierLien(parentId, enfantId);
    await this.prisma.parentLink.delete({ where: { parentId_enfantId: { parentId, enfantId } } });
  }

  async nombreDeParents(eleveId: string): Promise<number> {
    return this.prisma.parentLink.count({ where: { enfantId: eleveId } });
  }

  // Accord parental donné depuis l'espace parent (distinct de la liaison, D0018).
  async donnerAccord(parentId: string, enfantId: string, maintenant = new Date()): Promise<void> {
    await this.verifierLien(parentId, enfantId);
    await this.prisma.user.updateMany({
      where: { id: enfantId, consentementParentalLe: null },
      data: { consentementParentalLe: maintenant },
    });
  }
}
