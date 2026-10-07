import { Injectable, NotFoundException } from "@nestjs/common";
import type { ElementModeration } from "@xel-e/shared";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { etatMessage } from "./regles";
import { versPieceJointePublique } from "./serialisation";

const MESSAGE_INTROUVABLE = "Message introuvable.";

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // File de modération : messages signalés non traités, les masqués d'abord, puis les plus signalés.
  async file(): Promise<ElementModeration[]> {
    const messages = await this.prisma.message.findMany({
      where: { deletedAt: null, signalements: { some: { traiteLe: null } } },
      take: 100,
      include: {
        sujet: { select: { id: true, titre: true } },
        auteur: { select: { pseudonyme: true, nomComplet: true, role: true } },
        signalements: { where: { traiteLe: null }, orderBy: { createdAt: "desc" }, select: { motif: true, createdAt: true } },
        piecesJointes: { select: { id: true, nomOriginal: true, type: true, taille: true } },
      },
    });
    return messages
      .map((message) => ({
        messageId: message.id,
        sujet: message.sujet,
        contenu: message.contenu,
        auteur: message.auteur,
        etat: etatMessage(message),
        verifie: message.verifieLe !== null,
        signalements: message.signalements.length,
        motifs: message.signalements.flatMap((s) => (s.motif ? [s.motif] : [])),
        dernierSignalementLe: (message.signalements[0]?.createdAt ?? message.createdAt).toISOString(),
        piecesJointes: message.piecesJointes.map(versPieceJointePublique),
      }))
      .sort(
        (a, b) =>
          Number(b.etat === "masque") - Number(a.etat === "masque") ||
          b.signalements - a.signalements ||
          b.dernierSignalementLe.localeCompare(a.dernierSignalementLe),
      );
  }

  private async messageActif(id: string) {
    const message = await this.prisma.message.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, auteurId: true, sujet: { select: { titre: true } } },
    });
    if (!message) throw new NotFoundException(MESSAGE_INTROUVABLE);
    return message;
  }

  // Innocenté : le message réapparaît, ses signalements sont soldés et il n'est plus masqué
  // automatiquement par la suite (de nouveaux signalements remontent toujours dans la file).
  async restaurer(id: string): Promise<void> {
    await this.messageActif(id);
    const maintenant = new Date();
    await this.prisma.$transaction([
      this.prisma.message.update({ where: { id }, data: { masque: false, masqueLe: null, verifieLe: maintenant } }),
      this.prisma.signalement.updateMany({ where: { messageId: id, traiteLe: null }, data: { traiteLe: maintenant } }),
    ]);
  }

  async supprimer(id: string): Promise<void> {
    const message = await this.messageActif(id);
    const maintenant = new Date();
    await this.prisma.$transaction([
      this.prisma.message.update({ where: { id }, data: { deletedAt: maintenant } }),
      this.prisma.signalement.updateMany({ where: { messageId: id, traiteLe: null }, data: { traiteLe: maintenant } }),
    ]);
    await this.notifications.notifier(
      [message.auteurId],
      "MODERATION",
      `Un de tes messages dans « ${message.sujet.titre} » a été supprimé par la modération : il ne respectait pas la charte du forum.`,
    );
  }

  async supprimerSujet(id: string): Promise<void> {
    const sujet = await this.prisma.sujetForum.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!sujet) throw new NotFoundException("Sujet introuvable.");
    const maintenant = new Date();
    await this.prisma.$transaction([
      this.prisma.sujetForum.update({ where: { id }, data: { deletedAt: maintenant } }),
      this.prisma.signalement.updateMany({
        where: { message: { sujetId: id }, traiteLe: null },
        data: { traiteLe: maintenant },
      }),
    ]);
  }
}
