import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type Paiement } from "@prisma/client";
import type { EtatAbonnement, MoyenPaiement, PaiementDto, PlanDto } from "@xel-e/shared";
import { randomUUID } from "node:crypto";
import type { Env } from "../config/env";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { SignatureInvalide, type CodeFournisseur, type PaymentProvider, type WebhookLu } from "./fournisseurs";
import { doitExpirer, doitRelancer, etatPremium, numeroRecu, prochainePeriode } from "./regles";

export const FOURNISSEURS = Symbol("FOURNISSEURS");

const dateLongue = (date: Date) => date.toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Africa/Dakar" });
const prenom = (nomComplet: string) => nomComplet.trim().split(/\s+/)[0] ?? nomComplet;

export interface Retraitement {
  programmer(evenementId: string): Promise<void>;
}

export function versPaiementDto(p: Paiement & { plan: { code: string; libelle: string }; beneficiaire: { nomComplet: string } }): PaiementDto {
  return {
    id: p.id,
    plan: { code: p.plan.code, libelle: p.plan.libelle },
    beneficiaire: p.beneficiaire.nomComplet,
    fournisseur: p.fournisseur,
    montant: p.montant,
    statut: p.statut,
    creeLe: p.createdAt.toISOString(),
    confirmeLe: p.confirmeLe?.toISOString() ?? null,
    numeroRecu: p.numeroRecu,
  };
}

@Injectable()
export class PaiementsService {
  private readonly logger = new Logger(PaiementsService.name);
  private readonly appUrl: string;
  private retraitement?: Retraitement;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
    @Inject(FOURNISSEURS) private readonly fournisseurs: Map<CodeFournisseur, PaymentProvider>,
  ) {
    this.appUrl = config.get("APP_URL", { infer: true });
  }

  brancherRetraitement(retraitement: Retraitement): void {
    this.retraitement = retraitement;
  }

  private fournisseur(code: string): PaymentProvider {
    const fournisseur = this.fournisseurs.get(code as CodeFournisseur);
    if (!fournisseur) throw new BadRequestException("Ce moyen de paiement n'est pas disponible.");
    return fournisseur;
  }

  moyens(): MoyenPaiement[] {
    return [...this.fournisseurs.values()].map((f) => ({ code: f.code, libelle: f.libelle }));
  }

  async plans(): Promise<PlanDto[]> {
    const plans = await this.prisma.plan.findMany({ where: { actif: true }, orderBy: { ordre: "asc" } });
    return plans.map((p) => ({ code: p.code, libelle: p.libelle, prixFcfa: p.prixFcfa, dureeMois: p.dureeMois, aConfirmer: p.aConfirmer }));
  }

  // Bénéficiaire : l'élève lui-même, ou l'un des enfants liés au parent qui paie.
  async beneficiaireAutorise(payeur: { id: string; role: string }, beneficiaireId?: string): Promise<string> {
    if (payeur.role === "ELEVE") {
      if (beneficiaireId && beneficiaireId !== payeur.id) throw new ForbiddenException("Tu ne peux souscrire que pour ton propre compte.");
      return payeur.id;
    }
    if (payeur.role === "PARENT") {
      if (!beneficiaireId) throw new BadRequestException("Choisis l'enfant pour qui tu souscris.");
      const lien = await this.prisma.parentLink.findUnique({ where: { parentId_enfantId: { parentId: payeur.id, enfantId: beneficiaireId } } });
      if (!lien) throw new ForbiddenException("Vous n'êtes pas lié à cet élève.");
      return beneficiaireId;
    }
    throw new ForbiddenException("Premium est réservé aux élèves (payé par eux ou par un parent lié).");
  }

  async etat(beneficiaireId: string, maintenant = new Date()): Promise<EtatAbonnement> {
    const periodes = await this.prisma.abonnement.findMany({
      where: { utilisateurId: beneficiaireId },
      select: { statut: true, debutLe: true, expireLe: true },
    });
    const etat = etatPremium(periodes, maintenant);
    return { premium: etat.actif, jusquau: etat.jusquau?.toISOString() ?? null, aRenouveler: etat.aRenouveler };
  }

  // Ouvre un paiement chez le fournisseur et renvoie l'URL où l'utilisateur paie.
  async creer(
    payeur: { id: string; role: string },
    dto: { plan: string; fournisseur: string; beneficiaireId?: string },
  ): Promise<{ paiementId: string; urlPaiement: string }> {
    const beneficiaireId = await this.beneficiaireAutorise(payeur, dto.beneficiaireId);
    const plan = await this.prisma.plan.findFirst({ where: { code: dto.plan, actif: true } });
    if (!plan) throw new BadRequestException("Cette offre n'est pas disponible.");
    const fournisseur = this.fournisseur(dto.fournisseur);
    const paiement = await this.prisma.paiement.create({
      data: {
        payeurId: payeur.id,
        beneficiaireId,
        planId: plan.id,
        fournisseur: fournisseur.code,
        montant: plan.prixFcfa,
        referenceInterne: `XE-${randomUUID()}`,
      },
    });
    let checkout;
    try {
      checkout = await fournisseur.creerCheckout({
        referenceInterne: paiement.referenceInterne,
        montant: plan.prixFcfa,
        description: `Xel-E ${plan.libelle}`,
        urlRetour: `${this.appUrl}/abonnement/retour?paiement=${paiement.id}`,
        urlAnnulation: `${this.appUrl}/abonnement/retour?paiement=${paiement.id}&annule=1`,
        urlNotification: `${this.appUrl}/api/webhooks/${fournisseur.code.toLowerCase().replace("_", "-")}`,
      });
    } catch (error) {
      this.logger.error(`Checkout ${fournisseur.code} impossible : ${(error as Error).message}`);
      await this.prisma.paiement.update({ where: { id: paiement.id }, data: { statut: "ECHOUE" } });
      throw new ConflictException(`${fournisseur.libelle} ne répond pas pour le moment. Réessaie dans quelques minutes.`);
    }
    await this.prisma.paiement.update({
      where: { id: paiement.id },
      data: { refExterne: checkout.refExterne, urlPaiement: checkout.urlPaiement, jetonNotification: checkout.jetonNotification ?? null },
    });
    return { paiementId: paiement.id, urlPaiement: checkout.urlPaiement };
  }

  private async paiementVisible(id: string, utilisateurId: string) {
    const paiement = await this.prisma.paiement.findUnique({ where: { id }, include: { plan: true, beneficiaire: { select: { nomComplet: true } } } });
    // 404 plutôt que 403 : ne pas révéler les paiements des autres.
    if (!paiement || (paiement.payeurId !== utilisateurId && paiement.beneficiaireId !== utilisateurId)) {
      throw new NotFoundException("Paiement introuvable.");
    }
    return paiement;
  }

  async lire(id: string, utilisateurId: string): Promise<PaiementDto> {
    return versPaiementDto(await this.paiementVisible(id, utilisateurId));
  }

  // Au retour du fournisseur, on lui demande l'état réel (au cas où le webhook tarde ou s'est perdu).
  async verifier(id: string, utilisateurId: string): Promise<PaiementDto> {
    const paiement = await this.paiementVisible(id, utilisateurId);
    if (paiement.statut === "EN_ATTENTE" && paiement.refExterne) {
      try {
        const statut = await this.fournisseur(paiement.fournisseur).verifier({
          refExterne: paiement.refExterne,
          referenceInterne: paiement.referenceInterne,
          montant: paiement.montant,
        });
        if (statut === "CONFIRME") await this.confirmer(paiement.id);
        if (statut === "ECHOUE") await this.echouer(paiement.id);
      } catch (error) {
        this.logger.warn(`Vérification ${paiement.fournisseur} impossible : ${(error as Error).message}`);
      }
    }
    return this.lire(id, utilisateurId);
  }

  // Confirmation idempotente : seul le passage EN_ATTENTE → CONFIRME crée la période d'accès.
  // Les confirmations d'un même bénéficiaire sont sérialisées (verrou sur sa ligne) : jamais de
  // chevauchement de périodes, même avec deux paiements confirmés au même instant.
  async confirmer(paiementId: string, maintenant = new Date()): Promise<"confirme" | "deja-traite"> {
    const resultat = await this.prisma.$transaction(async (tx) => {
      const paiement = await tx.paiement.findUniqueOrThrow({ where: { id: paiementId }, include: { plan: true } });
      if (paiement.statut !== "EN_ATTENTE") return null;
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${paiement.beneficiaireId} FOR UPDATE`;
      const { count } = await tx.paiement.updateMany({ where: { id: paiementId, statut: "EN_ATTENTE" }, data: { statut: "CONFIRME", confirmeLe: maintenant } });
      if (count !== 1) return null;
      const periodes = await tx.abonnement.findMany({
        where: { utilisateurId: paiement.beneficiaireId },
        select: { statut: true, debutLe: true, expireLe: true },
      });
      const periode = prochainePeriode(periodes, maintenant, paiement.plan.dureeMois);
      const abonnement = await tx.abonnement.create({
        data: { utilisateurId: paiement.beneficiaireId, plan: paiement.plan.code, statut: "ACTIF", ...periode },
      });
      const annee = maintenant.getUTCFullYear();
      const compteur = await tx.compteurRecu.upsert({ where: { annee }, update: { valeur: { increment: 1 } }, create: { annee, valeur: 1 } });
      await tx.paiement.update({
        where: { id: paiementId },
        data: { abonnementId: abonnement.id, numeroRecu: numeroRecu(annee, compteur.valeur) },
      });
      return { paiement, periode };
    });
    if (!resultat) return "deja-traite";
    await this.prevenirConfirmation(resultat.paiement.payeurId, resultat.paiement.beneficiaireId, maintenant);
    return "confirme";
  }

  private async prevenirConfirmation(payeurId: string, beneficiaireId: string, maintenant: Date): Promise<void> {
    const etat = await this.etat(beneficiaireId, maintenant);
    const fin = etat.jusquau ? dateLongue(new Date(etat.jusquau)) : "";
    await this.notifications.notifier([beneficiaireId], "ABONNEMENT", `Ton accès Premium est activé jusqu'au ${fin}. Bonnes révisions !`);
    if (payeurId !== beneficiaireId) {
      const beneficiaire = await this.prisma.user.findUniqueOrThrow({ where: { id: beneficiaireId }, select: { nomComplet: true } });
      await this.notifications.notifier([payeurId], "ABONNEMENT", `Paiement reçu : Premium activé pour ${prenom(beneficiaire.nomComplet)} jusqu'au ${fin}.`);
    }
  }

  async echouer(paiementId: string): Promise<void> {
    const { count } = await this.prisma.paiement.updateMany({ where: { id: paiementId, statut: "EN_ATTENTE" }, data: { statut: "ECHOUE" } });
    if (count === 1) {
      const paiement = await this.prisma.paiement.findUniqueOrThrow({ where: { id: paiementId } });
      await this.notifications.notifier(
        [paiement.payeurId],
        "ABONNEMENT",
        "Le paiement n'a pas abouti : aucun montant n'a été validé. Tu peux réessayer depuis la page « Mon abonnement ».",
      );
    }
  }

  // --- Webhooks ---

  // 1. Signature (sinon 401, rien en base). 2. Journal de l'événement, unique par fournisseur :
  // un événement rejoué n'est pas retraité. 3. Traitement ; en cas d'échec, l'événement est marqué
  // et confié à la file de retraitement (le fournisseur reçoit quand même 200 : c'est à nous de finir).
  async recevoirWebhook(
    code: string,
    corpsBrut: string,
    entetes: Record<string, string | undefined>,
    requete: Record<string, string | undefined>,
  ): Promise<{ statut: "traite" | "deja-traite" | "a-retraiter" }> {
    const fournisseur = this.fournisseurs.get(code as CodeFournisseur);
    if (!fournisseur) throw new NotFoundException("Fournisseur inconnu.");
    let lu: WebhookLu;
    try {
      lu = fournisseur.lireWebhook(corpsBrut, entetes, requete);
    } catch (error) {
      if (error instanceof SignatureInvalide || error instanceof SyntaxError) throw new UnauthorizedException("Signature invalide.");
      throw error;
    }
    // Orange Money : le jeton de notification doit correspondre à un paiement que nous avons ouvert.
    if (lu.jetonNotification !== undefined) {
      const attendu = await this.prisma.paiement.findFirst({ where: { jetonNotification: lu.jetonNotification, fournisseur: code } });
      if (!attendu) throw new UnauthorizedException("Signature invalide.");
    }

    let evenement;
    try {
      evenement = await this.prisma.evenementPaiement.create({
        data: { fournisseur: code, idEvenement: lu.idEvenement, type: lu.type, charge: lu as unknown as Prisma.InputJsonValue },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { statut: "deja-traite" };
      throw error;
    }
    try {
      await this.appliquer(code, lu);
      await this.prisma.evenementPaiement.update({ where: { id: evenement.id }, data: { statut: "TRAITE", traiteLe: new Date(), tentatives: 1 } });
      return { statut: "traite" };
    } catch (error) {
      await this.prisma.evenementPaiement.update({
        where: { id: evenement.id },
        data: { statut: "ECHEC", tentatives: 1, derniereErreur: (error as Error).message },
      });
      this.logger.error(`Webhook ${code} ${lu.idEvenement} en échec : ${(error as Error).message}`);
      await this.retraitement?.programmer(evenement.id);
      return { statut: "a-retraiter" };
    }
  }

  private async appliquer(code: string, lu: WebhookLu): Promise<void> {
    const paiement = await this.prisma.paiement.findFirst({
      where: {
        fournisseur: code,
        OR: [
          ...(lu.refExterne ? [{ refExterne: lu.refExterne }] : []),
          ...(lu.referenceInterne ? [{ referenceInterne: lu.referenceInterne }] : []),
          ...(lu.jetonNotification ? [{ jetonNotification: lu.jetonNotification }] : []),
        ],
      },
    });
    if (!paiement) throw new Error("Paiement introuvable pour cet événement.");
    if (lu.montant !== undefined && lu.montant !== paiement.montant) throw new Error(`Montant inattendu (${lu.montant} au lieu de ${paiement.montant}).`);
    if (lu.statut === "CONFIRME") await this.confirmer(paiement.id);
    else if (lu.statut === "ECHOUE") await this.echouer(paiement.id);
  }

  // Rejoue un événement en échec (file de retraitement, backoff exponentiel).
  async retraiter(evenementId: string): Promise<void> {
    const evenement = await this.prisma.evenementPaiement.findUniqueOrThrow({ where: { id: evenementId } });
    if (evenement.statut === "TRAITE") return;
    try {
      await this.appliquer(evenement.fournisseur, evenement.charge as unknown as WebhookLu);
      await this.prisma.evenementPaiement.update({
        where: { id: evenementId },
        data: { statut: "TRAITE", traiteLe: new Date(), tentatives: { increment: 1 }, derniereErreur: null },
      });
    } catch (error) {
      await this.prisma.evenementPaiement.update({
        where: { id: evenementId },
        data: { tentatives: { increment: 1 }, derniereErreur: (error as Error).message },
      });
      throw error;
    }
  }

  // --- Cycle des abonnements (job horaire) ---

  async cycle(maintenant = new Date()): Promise<{ expires: number; relances: number }> {
    const actifs = await this.prisma.abonnement.findMany({
      where: { statut: "ACTIF" },
      select: { id: true, utilisateurId: true, statut: true, debutLe: true, expireLe: true, relanceLe: true },
    });
    let expires = 0;
    let relances = 0;
    for (const periode of actifs) {
      if (doitExpirer(periode, maintenant)) {
        const { count } = await this.prisma.abonnement.updateMany({ where: { id: periode.id, statut: "ACTIF" }, data: { statut: "EXPIRE" } });
        expires += count;
        // Rétrogradation douce : on ne prévient que si aucune autre période ne prend le relais.
        if (count === 1 && !(await this.etat(periode.utilisateurId, maintenant)).premium) {
          await this.notifications.notifier(
            [periode.utilisateurId],
            "ABONNEMENT",
            `Ton accès Premium a pris fin le ${dateLongue(periode.expireLe as Date)}. Tes résultats restent disponibles ; renouvelle-le pour retrouver les examens blancs Premium.`,
          );
        }
        continue;
      }
      const autres = actifs.filter((p) => p.utilisateurId === periode.utilisateurId);
      if (doitRelancer(periode, autres, maintenant)) {
        const { count } = await this.prisma.abonnement.updateMany({ where: { id: periode.id, relanceLe: null }, data: { relanceLe: maintenant } });
        if (count === 1) {
          relances += 1;
          await this.relancer(periode.utilisateurId, periode.expireLe as Date);
        }
      }
    }
    return { expires, relances };
  }

  // Relance J-3 : l'élève et les parents qui ont déjà payé pour lui, dans l'application et par email.
  private async relancer(eleveId: string, fin: Date): Promise<void> {
    const payeurs = await this.prisma.paiement.findMany({
      where: { beneficiaireId: eleveId, statut: "CONFIRME" },
      distinct: ["payeurId"],
      select: { payeur: { select: { id: true, email: true, nomComplet: true } } },
    });
    const eleve = await this.prisma.user.findUniqueOrThrow({ where: { id: eleveId }, select: { id: true, email: true, nomComplet: true } });
    const destinataires = new Map([[eleve.id, eleve], ...payeurs.map(({ payeur }) => [payeur.id, payeur] as const)]);
    const contenu = `L'accès Premium de ${prenom(eleve.nomComplet)} se termine le ${dateLongue(fin)}. Renouvelez-le depuis la page « Mon abonnement » pour garder les examens blancs.`;
    await this.notifications.notifier([...destinataires.keys()], "ABONNEMENT", contenu);
    for (const destinataire of destinataires.values()) {
      if (!destinataire.email) continue;
      await this.mail.envoyer({
        destinataire: destinataire.email,
        sujet: "Votre accès Premium Xel-E se termine bientôt",
        texte: `Bonjour ${destinataire.nomComplet},\n\n${contenu}\n\n${this.appUrl}/abonnement\n\n— L'équipe Xel-E\nXeeli ci xel`,
      });
    }
  }

  // --- Historique et reçus ---

  async historique(utilisateurId: string): Promise<PaiementDto[]> {
    const paiements = await this.prisma.paiement.findMany({
      where: { OR: [{ payeurId: utilisateurId }, { beneficiaireId: utilisateurId }], NOT: { statut: "EN_ATTENTE", createdAt: { lt: new Date(Date.now() - 86_400_000) } } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { plan: true, beneficiaire: { select: { nomComplet: true } } },
    });
    return paiements.map(versPaiementDto);
  }

  async donneesRecu(id: string, utilisateurId: string) {
    const paiement = await this.prisma.paiement.findUnique({
      where: { id },
      include: { plan: true, abonnement: true, beneficiaire: { select: { nomComplet: true } }, payeur: { select: { nomComplet: true, email: true, identifiant: true } } },
    });
    if (!paiement || (paiement.payeurId !== utilisateurId && paiement.beneficiaireId !== utilisateurId)) {
      throw new NotFoundException("Paiement introuvable.");
    }
    if (paiement.statut !== "CONFIRME" || !paiement.numeroRecu || !paiement.abonnement) {
      throw new ConflictException("Le reçu est disponible une fois le paiement confirmé.");
    }
    return paiement;
  }
}
