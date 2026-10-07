import { Global, Injectable, Logger, Module } from "@nestjs/common";
import type { NotificationEleve } from "@xel-e/shared";
import { PrismaService } from "../prisma/prisma.service";

export type TypeNotification = "BADGE" | "REVUE" | "FORUM" | "MODERATION";

// Notifications in-app. Un échec d'envoi est journalisé sans faire échouer l'action qui l'a déclenché.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notifier(utilisateurIds: string[], type: TypeNotification, contenu: string): Promise<void> {
    if (utilisateurIds.length === 0) return;
    try {
      await this.prisma.notification.createMany({
        data: utilisateurIds.map((utilisateurId) => ({ utilisateurId, type, contenu })),
      });
    } catch (error) {
      this.logger.error(`Notification non enregistrée (${type}) : ${(error as Error).message}`);
    }
  }

  async notifierAdmins(type: TypeNotification, contenu: string, saufId?: string): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: "ADMIN", deletedAt: null, ...(saufId ? { id: { not: saufId } } : {}) },
        select: { id: true },
      });
      await this.notifier(
        admins.map((admin) => admin.id),
        type,
        contenu,
      );
    } catch (error) {
      this.logger.error(`Notification aux administrateurs non enregistrée : ${(error as Error).message}`);
    }
  }

  async recentes(utilisateurId: string): Promise<{ notifications: NotificationEleve[]; nonLues: number }> {
    const [notifications, nonLues] = await Promise.all([
      this.prisma.notification.findMany({ where: { utilisateurId }, orderBy: { createdAt: "desc" }, take: 10 }),
      this.prisma.notification.count({ where: { utilisateurId, lu: false } }),
    ]);
    return {
      notifications: notifications.map((n) => ({ id: n.id, contenu: n.contenu, lu: n.lu, createdAt: n.createdAt.toISOString() })),
      nonLues,
    };
  }
}

@Global()
@Module({ providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
