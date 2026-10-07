import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import {
  INFOS_MATIERES,
  matiereParSlug,
  NIVEAUX,
  type CreerSujetDto,
  type EtatForum,
  type Matiere,
  type Niveau,
  type PageForum,
  type RepondreDto,
  type SujetForumDetail,
} from "@xel-e/shared";
import Redis from "ioredis";
import { raisonFermetureForum } from "../auth/acces-forum";
import type { Env } from "../config/env";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { REDIS_CLIENT } from "../redis/redis.module";
import { filtrerMessage } from "./filtre-contenu";
import { doitMasquer } from "./regles";
import { versAuteurPublic, versMessagePublic } from "./serialisation";
import { TermesService } from "./termes.service";

const SUJET_INTROUVABLE = "Ce sujet n'existe pas ou a été retiré.";
const MESSAGE_INTROUVABLE = "Ce message n'existe pas ou a été retiré.";
// Anti-flood par compte : 20 messages par tranche de 10 minutes.
export const MAX_MESSAGES_PAR_FENETRE = 20;
const FENETRE_MESSAGES_S = 10 * 60;

const SELECTION_PROFIL = {
  id: true,
  role: true,
  statutCompte: true,
  email: true,
  emailConfirmeLe: true,
  naissanceMois: true,
  naissanceAnnee: true,
  consentementParentalLe: true,
  pseudonyme: true,
  niveau: { select: { libelle: true } },
} satisfies Prisma.UserSelect;

type Profil = Prisma.UserGetPayload<{ select: typeof SELECTION_PROFIL }>;

function erreurChamps(message: string, erreurs: Record<string, string>): BadRequestException {
  return new BadRequestException({ statusCode: 400, message, erreurs });
}

@Injectable()
export class ForumService {
  private readonly logger = new Logger(ForumService.name);
  private readonly domaineSite: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly termes: TermesService,
    private readonly notifications: NotificationsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.domaineSite = new URL(config.get("APP_URL", { infer: true })).host;
  }

  private profil(utilisateurId: string): Promise<Profil> {
    return this.prisma.user.findUniqueOrThrow({ where: { id: utilisateurId }, select: SELECTION_PROFIL });
  }

  async etat(utilisateurId: string, maintenant = new Date()): Promise<EtatForum> {
    const profil = await this.profil(utilisateurId);
    const raison = raisonFermetureForum(profil, maintenant);
    return {
      acces: raison === null,
      raison,
      pseudonyme: profil.pseudonyme,
      niveau: (profil.niveau?.libelle as Niveau | undefined) ?? null,
      liensAutorises: profil.role !== "ELEVE",
    };
  }

  // Lecture comme écriture : le forum est fermé tant que les conditions du compte ne sont pas réunies.
  private async exigerAcces(utilisateurId: string): Promise<Profil> {
    const profil = await this.profil(utilisateurId);
    const raison = raisonFermetureForum(profil, new Date());
    if (raison) throw new ForbiddenException(raison);
    return profil;
  }

  private exigerPseudonyme(profil: Profil): void {
    if (!profil.pseudonyme) {
      throw erreurChamps("Choisis d'abord un pseudonyme : c'est le seul nom affiché sur le forum.", {
        pseudonyme: "Pseudonyme obligatoire pour participer.",
      });
    }
  }

  async definirPseudonyme(utilisateurId: string, pseudonyme: string): Promise<EtatForum> {
    await this.exigerAcces(utilisateurId);
    try {
      await this.prisma.user.update({ where: { id: utilisateurId }, data: { pseudonyme } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          statusCode: 409,
          message: "Ce pseudonyme est déjà pris.",
          erreurs: { pseudonyme: "Ce pseudonyme est déjà pris." },
        });
      }
      throw error;
    }
    return this.etat(utilisateurId);
  }

  async page(utilisateurId: string, niveau: string, slugMatiere: string): Promise<PageForum> {
    await this.exigerAcces(utilisateurId);
    const matiere = matiereParSlug(slugMatiere);
    if (!matiere || !(NIVEAUX as readonly string[]).includes(niveau)) {
      throw new NotFoundException("Niveau ou matière inconnu.");
    }
    const sujets = await this.prisma.sujetForum.findMany({
      where: { niveau: { libelle: niveau }, matiere: { libelle: matiere.libelle }, deletedAt: null },
      orderBy: { dernierMessageLe: "desc" },
      take: 50,
      select: {
        id: true,
        titre: true,
        createdAt: true,
        dernierMessageLe: true,
        auteur: { select: { pseudonyme: true, role: true } },
        _count: { select: { messages: { where: { deletedAt: null } } } },
      },
    });
    return {
      niveau: niveau as Niveau,
      matiere,
      sujets: sujets.map((sujet) => ({
        id: sujet.id,
        titre: sujet.titre,
        auteur: versAuteurPublic(sujet.auteur),
        nombreReponses: Math.max(0, sujet._count.messages - 1),
        dernierMessageLe: sujet.dernierMessageLe.toISOString(),
        createdAt: sujet.createdAt.toISOString(),
      })),
    };
  }

  async sujet(utilisateurId: string, id: string): Promise<SujetForumDetail> {
    await this.exigerAcces(utilisateurId);
    const sujet = await this.prisma.sujetForum.findFirst({
      where: { id, deletedAt: null },
      include: {
        niveau: { select: { libelle: true } },
        matiere: { select: { libelle: true } },
        auteur: { select: { pseudonyme: true, role: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 200,
          include: {
            auteur: { select: { pseudonyme: true, role: true } },
            piecesJointes: { select: { id: true, nomOriginal: true, type: true, taille: true } },
            // Seulement le signalement du lecteur : l'identité des autres signalants ne sort jamais.
            signalements: { where: { signalantId: utilisateurId }, select: { signalantId: true } },
          },
        },
      },
    });
    if (!sujet) throw new NotFoundException(SUJET_INTROUVABLE);
    return {
      id: sujet.id,
      titre: sujet.titre,
      niveau: sujet.niveau.libelle as Niveau,
      matiere: INFOS_MATIERES[sujet.matiere.libelle as Matiere],
      auteur: versAuteurPublic(sujet.auteur),
      messages: sujet.messages.map((message) => versMessagePublic(message, utilisateurId)),
    };
  }

  private async verifierContenu(profil: Profil, texte: string): Promise<void> {
    const verdict = filtrerMessage(texte, {
      termes: await this.termes.termes(),
      liensAutorises: profil.role !== "ELEVE",
      domaineSite: this.domaineSite,
    });
    if (!verdict.accepte) throw erreurChamps(verdict.raisons.join(" "), { contenu: verdict.raisons[0]! });
  }

  private async limiterDebit(utilisateurId: string): Promise<void> {
    const cle = `forum:debit:${utilisateurId}`;
    let compte: number;
    try {
      compte = await this.redis.incr(cle);
      if (compte === 1) await this.redis.expire(cle, FENETRE_MESSAGES_S);
    } catch (error) {
      this.logger.warn(`Limiteur du forum indisponible : ${(error as Error).message}`);
      return;
    }
    if (compte > MAX_MESSAGES_PAR_FENETRE) {
      throw new HttpException(
        { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: "Tu publies beaucoup de messages : patiente quelques minutes." },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async preparerPublication(utilisateurId: string, texte: string): Promise<Profil> {
    const profil = await this.exigerAcces(utilisateurId);
    this.exigerPseudonyme(profil);
    await this.verifierContenu(profil, texte);
    await this.limiterDebit(utilisateurId);
    return profil;
  }

  // Rattache au message des pièces jointes téléversées par son auteur et encore libres.
  private async rattacher(tx: Prisma.TransactionClient, ids: string[], auteurId: string, messageId: string): Promise<void> {
    if (ids.length === 0) return;
    const uniques = [...new Set(ids)];
    const { count } = await tx.pieceJointe.updateMany({
      where: { id: { in: uniques }, auteurId, messageId: null },
      data: { messageId },
    });
    if (count !== uniques.length) {
      throw erreurChamps("Une pièce jointe est introuvable ou déjà utilisée.", { piecesJointes: "Pièce jointe invalide." });
    }
  }

  async creerSujet(utilisateurId: string, dto: CreerSujetDto): Promise<SujetForumDetail> {
    await this.preparerPublication(utilisateurId, `${dto.titre}\n${dto.contenu}`);
    const [niveau, matiere] = await Promise.all([
      this.prisma.niveau.findUniqueOrThrow({ where: { libelle: dto.niveau } }),
      this.prisma.matiere.findUniqueOrThrow({ where: { libelle: dto.matiere } }),
    ]);
    const sujet = await this.prisma.$transaction(async (tx) => {
      const cree = await tx.sujetForum.create({
        data: { niveauId: niveau.id, matiereId: matiere.id, titre: dto.titre, auteurId: utilisateurId },
      });
      const message = await tx.message.create({ data: { sujetId: cree.id, auteurId: utilisateurId, contenu: dto.contenu } });
      await this.rattacher(tx, dto.piecesJointes, utilisateurId, message.id);
      return cree;
    });
    return this.sujet(utilisateurId, sujet.id);
  }

  async repondre(utilisateurId: string, sujetId: string, dto: RepondreDto): Promise<SujetForumDetail> {
    await this.preparerPublication(utilisateurId, dto.contenu);
    const sujet = await this.prisma.sujetForum.findFirst({ where: { id: sujetId, deletedAt: null } });
    if (!sujet) throw new NotFoundException(SUJET_INTROUVABLE);
    await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({ data: { sujetId, auteurId: utilisateurId, contenu: dto.contenu } });
      await this.rattacher(tx, dto.piecesJointes, utilisateurId, message.id);
      await tx.sujetForum.update({ where: { id: sujetId }, data: { dernierMessageLe: message.createdAt } });
    });
    if (sujet.auteurId !== utilisateurId) {
      await this.notifications.notifier([sujet.auteurId], "FORUM", `Nouvelle réponse à ton sujet « ${sujet.titre} ».`);
    }
    return this.sujet(utilisateurId, sujetId);
  }

  // Un signalement par compte et par message ; au 3e (comptes distincts), le message est masqué
  // en attendant la modération.
  async signaler(utilisateurId: string, messageId: string, motif: string | undefined): Promise<{ masque: boolean }> {
    await this.exigerAcces(utilisateurId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, deletedAt: null, sujet: { deletedAt: null } },
      select: { id: true, auteurId: true, masque: true, verifieLe: true, deletedAt: true },
    });
    if (!message) throw new NotFoundException(MESSAGE_INTROUVABLE);
    if (message.auteurId === utilisateurId) throw new BadRequestException("Tu ne peux pas signaler ton propre message.");

    try {
      await this.prisma.signalement.create({ data: { messageId, signalantId: utilisateurId, motif: motif || null } });
    } catch (error) {
      // Déjà signalé par ce compte : rien ne change (un compte ne compte qu'une fois).
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      return { masque: message.masque };
    }

    const actifs = await this.prisma.signalement.count({ where: { messageId, traiteLe: null } });
    if (!doitMasquer(message, actifs)) return { masque: message.masque };
    const { count } = await this.prisma.message.updateMany({
      where: { id: messageId, masque: false, verifieLe: null, deletedAt: null },
      data: { masque: true, masqueLe: new Date() },
    });
    if (count === 1) {
      await this.notifications.notifierAdmins("MODERATION", "Un message du forum a été masqué automatiquement après 3 signalements.");
    }
    return { masque: true };
  }
}
