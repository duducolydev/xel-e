import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type CanalNotification } from "@prisma/client";
import type { Env } from "../config/env";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { NOTIFICATION_CHANNEL, type NotificationChannel } from "./canaux";
import { periodeDuResume, type Periode, type TypeResume } from "./periodes";
import { PREFERENCES_PAR_DEFAUT, PreferencesService } from "./preferences.service";
import { composerResume } from "./resume";
import { SuiviService } from "./suivi.service";

// Un envoi = un parent, une période, un canal : c'est l'unité rejouée en cas d'échec.
export interface Envoi {
  parentId: string;
  periode: string;
  canal: CanalNotification;
  destinataire: string;
  sujet: string;
  texte: string;
}

// Canaux choisis par le parent : l'in-app toujours, puis email, WhatsApp et SMS selon ses préférences.
export function canauxDe(
  preferences: { email: boolean; whatsapp: boolean; sms: boolean; telephone: string | null },
  email: string | null,
): { canal: CanalNotification; destinataire: string }[] {
  const canaux: { canal: CanalNotification; destinataire: string }[] = [{ canal: "IN_APP", destinataire: "" }];
  if (preferences.email && email) canaux.push({ canal: "EMAIL", destinataire: email });
  if (preferences.whatsapp && preferences.telephone) canaux.push({ canal: "WHATSAPP", destinataire: preferences.telephone });
  if (preferences.sms && preferences.telephone) canaux.push({ canal: "SMS", destinataire: preferences.telephone });
  return canaux;
}

@Injectable()
export class ResumesService {
  private readonly logger = new Logger(ResumesService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly suivi: SuiviService,
    private readonly preferences: PreferencesService,
    private readonly mail: MailService,
    @Inject(NOTIFICATION_CHANNEL) private readonly canal: NotificationChannel,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get("APP_URL", { infer: true });
  }

  // Compose les résumés de tous les parents concernés par cette fréquence et liés à au moins un enfant.
  async preparer(type: TypeResume, maintenant = new Date()): Promise<{ periode: Periode; envois: Envoi[] }> {
    const periode = periodeDuResume(type, maintenant);
    const parents = await this.prisma.user.findMany({
      where: {
        role: "PARENT",
        deletedAt: null,
        enfants: { some: { enfant: { deletedAt: null } } },
        // Sans préférences enregistrées, le parent reçoit le résumé hebdomadaire par défaut.
        ...(type === PREFERENCES_PAR_DEFAUT.frequence
          ? { OR: [{ preferences: null }, { preferences: { frequence: type } }] }
          : { preferences: { frequence: type } }),
      },
      select: {
        id: true,
        nomComplet: true,
        email: true,
        preferences: true,
        enfants: { where: { enfant: { deletedAt: null } }, orderBy: { createdAt: "asc" }, select: { enfantId: true } },
      },
    });

    const envois: Envoi[] = [];
    for (const parent of parents) {
      const enfants = await Promise.all(parent.enfants.map(({ enfantId }) => this.suivi.activiteEntre(enfantId, periode, maintenant)));
      const resume = composerResume({
        parent: parent.nomComplet,
        periode,
        enfants,
        liens: {
          tableauDeBord: `${this.appUrl}/parent`,
          desinscription: `${this.appUrl}/desinscription?token=${encodeURIComponent(this.preferences.jetonDesinscription(parent.id))}`,
        },
      });
      for (const { canal, destinataire } of canauxDe(parent.preferences ?? PREFERENCES_PAR_DEFAUT, parent.email)) {
        envois.push({
          parentId: parent.id,
          periode: periode.cle,
          canal,
          destinataire,
          sujet: resume.sujet,
          texte: canal === "EMAIL" ? resume.texte : resume.texteCourt,
        });
      }
    }
    return { periode, envois };
  }

  // Idempotent : un envoi déjà fait pour ce parent, cette période et ce canal n'est pas refait.
  // Une erreur remonte telle quelle pour que la file retente plus tard (backoff exponentiel).
  async envoyer(envoi: Envoi): Promise<"envoye" | "deja-envoye"> {
    const cle = { parentId_periode_canal: { parentId: envoi.parentId, periode: envoi.periode, canal: envoi.canal } };
    if (await this.prisma.resumeEnvoye.findUnique({ where: cle })) return "deja-envoye";

    switch (envoi.canal) {
      case "IN_APP":
        await this.prisma.notification.create({
          data: { utilisateurId: envoi.parentId, type: "RESUME", contenu: envoi.texte },
        });
        break;
      case "EMAIL":
        await this.mail.envoyerOuEchouer({ destinataire: envoi.destinataire, sujet: envoi.sujet, texte: envoi.texte });
        break;
      case "WHATSAPP":
      case "SMS":
        await this.canal.envoyer(envoi.canal, envoi.destinataire, envoi.texte);
        break;
    }

    try {
      await this.prisma.resumeEnvoye.create({ data: { parentId: envoi.parentId, periode: envoi.periode, canal: envoi.canal } });
    } catch (error) {
      // Envoyé en parallèle par un autre worker : la trace existe déjà, rien à faire.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
    this.logger.log(`Résumé ${envoi.periode} envoyé (${envoi.canal}) au parent ${envoi.parentId}`);
    return "envoye";
  }
}
