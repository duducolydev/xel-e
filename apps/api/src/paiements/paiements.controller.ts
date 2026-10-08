import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  type RawBodyRequest,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  creerPaiementSchema,
  modifierPlanSchema,
  type CreerPaiementDto,
  type ModifierPlanDto,
  type PageAbonnement,
  type PaiementDto,
  type PlanDto,
} from "@xel-e/shared";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { CurrentUser, Public, Roles, type UtilisateurAuthentifie } from "../auth/decorators";
import { LimiterDebit } from "../auth/rate-limit";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { Env } from "../config/env";
import { ContenusModule } from "../contenus/contenus.module";
import { PdfService } from "../contenus/pdf.service";
import { PrismaService } from "../prisma/prisma.service";
import { FilePaiements } from "./file-paiements";
import { FournisseurOrangeMoney, FournisseurSimule, FournisseurWave, type CodeFournisseur, type PaymentProvider } from "./fournisseurs";
import { FOURNISSEURS, PaiementsService } from "./paiements.service";
import { gabaritRecu } from "./recu";
import { signerWebhook } from "./regles";

const idValide = new ParseUUIDPipe({ version: "4" });
const SEGMENTS: Record<string, CodeFournisseur> = { wave: "WAVE", "orange-money": "ORANGE_MONEY", simule: "SIMULE" };

@Roles("ELEVE", "PARENT")
@Controller()
export class PaiementsController {
  constructor(
    private readonly paiements: PaiementsService,
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
  ) {}

  // Page « Mon abonnement » : état, offres, moyens de paiement, historique.
  @Get("abonnement")
  async page(@CurrentUser() utilisateur: UtilisateurAuthentifie, @Query("beneficiaire") beneficiaire?: string): Promise<PageAbonnement> {
    const enfants =
      utilisateur.role === "PARENT"
        ? (
            await this.prisma.parentLink.findMany({
              where: { parentId: utilisateur.id, enfant: { deletedAt: null } },
              orderBy: { createdAt: "asc" },
              select: { enfant: { select: { id: true, nomComplet: true } } },
            })
          ).map((l) => l.enfant)
        : [];
    if (utilisateur.role === "PARENT" && enfants.length === 0) throw new BadRequestException("Liez d'abord le compte de votre enfant depuis votre espace parent.");
    const beneficiaireId = await this.paiements.beneficiaireAutorise(utilisateur, beneficiaire || enfants[0]?.id);
    const [beneficiaireCompte, etat, plans, paiements] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: beneficiaireId }, select: { id: true, nomComplet: true } }),
      this.paiements.etat(beneficiaireId),
      this.paiements.plans(),
      this.paiements.historique(utilisateur.id),
    ]);
    return { beneficiaire: beneficiaireCompte, enfants, etat, plans, moyens: this.paiements.moyens(), paiements };
  }

  @Post("paiements")
  @LimiterDebit({ nom: "paiements", max: 30, fenetreSecondes: 15 * 60 })
  creer(@Body(new ZodValidationPipe(creerPaiementSchema)) dto: CreerPaiementDto, @CurrentUser() utilisateur: UtilisateurAuthentifie) {
    return this.paiements.creer(utilisateur, dto);
  }

  @Get("paiements/:id")
  lire(@Param("id", idValide) id: string, @CurrentUser() utilisateur: UtilisateurAuthentifie): Promise<PaiementDto> {
    return this.paiements.lire(id, utilisateur.id);
  }

  @Post("paiements/:id/verifier")
  @HttpCode(HttpStatus.OK)
  verifier(@Param("id", idValide) id: string, @CurrentUser() utilisateur: UtilisateurAuthentifie): Promise<PaiementDto> {
    return this.paiements.verifier(id, utilisateur.id);
  }

  @Get("paiements/:id/recu")
  async recu(
    @Param("id", idValide) id: string,
    @CurrentUser() utilisateur: UtilisateurAuthentifie,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const paiement = await this.paiements.donneesRecu(id, utilisateur.id);
    const pdf = await this.pdf.genererDepuisHtml(
      gabaritRecu({
        numeroRecu: paiement.numeroRecu as string,
        confirmeLe: paiement.confirmeLe as Date,
        montant: paiement.montant,
        fournisseur: paiement.fournisseur,
        referenceInterne: paiement.referenceInterne,
        plan: paiement.plan,
        payeur: paiement.payeur,
        beneficiaire: paiement.beneficiaire,
        periode: { debutLe: paiement.abonnement!.debutLe, expireLe: paiement.abonnement!.expireLe },
      }),
    );
    res.setHeader("Content-Disposition", `attachment; filename="recu-${paiement.numeroRecu}.pdf"`);
    return new StreamableFile(pdf, { type: "application/pdf", length: pdf.length });
  }
}

// Webhooks des fournisseurs : publics, authentifiés par leur signature (corps brut).
@Public()
@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly paiements: PaiementsService) {}

  @Post(":fournisseur")
  @HttpCode(HttpStatus.OK)
  @LimiterDebit({ nom: "webhooks", max: 600, fenetreSecondes: 60 })
  recevoir(@Param("fournisseur") segment: string, @Req() requete: RawBodyRequest<Request>) {
    const code = SEGMENTS[segment];
    if (!code) throw new NotFoundException("Fournisseur inconnu.");
    const entetes = Object.fromEntries(Object.entries(requete.headers).map(([cle, valeur]) => [cle, Array.isArray(valeur) ? valeur[0] : valeur]));
    const parametres = Object.fromEntries(Object.entries(requete.query).map(([cle, valeur]) => [cle, typeof valeur === "string" ? valeur : undefined]));
    return this.paiements.recevoirWebhook(code, requete.rawBody?.toString("utf8") ?? "", entetes, parametres);
  }
}

// Simulateur (hors production) : la page « payer / refuser » fabrique un webhook signé, traité par le
// même chemin que ceux des vrais fournisseurs.
@Roles("ELEVE", "PARENT")
@Controller("paiements/simulateur")
export class SimulateurController {
  constructor(
    private readonly paiements: PaiementsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private async paiementSimule(ref: string, payeurId: string) {
    if (!this.config.get("PAIEMENTS_SIMULES", { infer: true })) throw new NotFoundException();
    const paiement = await this.prisma.paiement.findFirst({ where: { refExterne: ref, fournisseur: "SIMULE", payeurId }, include: { plan: true, beneficiaire: true } });
    if (!paiement) throw new NotFoundException("Paiement simulé introuvable.");
    return paiement;
  }

  @Get(":ref")
  async lire(@Param("ref") ref: string, @CurrentUser() utilisateur: UtilisateurAuthentifie) {
    const paiement = await this.paiementSimule(ref, utilisateur.id);
    return { paiementId: paiement.id, montant: paiement.montant, plan: paiement.plan.libelle, beneficiaire: paiement.beneficiaire.nomComplet, statut: paiement.statut };
  }

  @Post(":ref/:issue")
  @HttpCode(HttpStatus.OK)
  async decider(@Param("ref") ref: string, @Param("issue") issue: string, @CurrentUser() utilisateur: UtilisateurAuthentifie) {
    if (issue !== "payer" && issue !== "refuser") throw new BadRequestException("Choix inconnu.");
    const paiement = await this.paiementSimule(ref, utilisateur.id);
    const corps = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: issue === "payer" ? "paiement.reussi" : "paiement.echoue",
      data: { id: ref, montant: paiement.montant },
    });
    const signature = signerWebhook(this.config.get("PAIEMENT_SIMULE_SECRET", { infer: true }), Math.floor(Date.now() / 1000), corps);
    await this.paiements.recevoirWebhook("SIMULE", corps, { "x-signature-simulateur": signature }, {});
    return { paiementId: paiement.id };
  }
}

@Roles("ADMIN")
@Controller("admin")
export class AdminPaiementsController {
  constructor(
    private readonly paiements: PaiementsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("plans")
  async plans(): Promise<(PlanDto & { actif: boolean })[]> {
    const plans = await this.prisma.plan.findMany({ orderBy: { ordre: "asc" } });
    return plans.map((p) => ({ code: p.code, libelle: p.libelle, prixFcfa: p.prixFcfa, dureeMois: p.dureeMois, aConfirmer: p.aConfirmer, actif: p.actif }));
  }

  // Le prix confirmé par l'administration remplace la valeur provisoire.
  @Patch("plans/:code")
  async modifierPlan(@Param("code") code: string, @Body(new ZodValidationPipe(modifierPlanSchema)) dto: ModifierPlanDto) {
    const { count } = await this.prisma.plan.updateMany({ where: { code }, data: { prixFcfa: dto.prixFcfa, actif: dto.actif, aConfirmer: false } });
    if (count === 0) throw new NotFoundException("Offre inconnue.");
    return (await this.plans()).find((p) => p.code === code);
  }

  // Exécute le cycle des abonnements tout de suite (rattrapage, tests).
  @Post("abonnements/cycle")
  @HttpCode(HttpStatus.OK)
  cycle() {
    return this.paiements.cycle();
  }
}

@Module({
  imports: [ContenusModule],
  controllers: [PaiementsController, WebhooksController, SimulateurController, AdminPaiementsController],
  providers: [
    {
      provide: FOURNISSEURS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const fournisseurs = new Map<CodeFournisseur, PaymentProvider>();
        const lire = <K extends keyof Env>(cle: K) => config.get(cle, { infer: true }) as Env[K];
        if (lire("WAVE_API_KEY") && lire("WAVE_WEBHOOK_SECRET")) {
          fournisseurs.set("WAVE", new FournisseurWave({ cleApi: lire("WAVE_API_KEY")!, secretWebhook: lire("WAVE_WEBHOOK_SECRET")!, url: lire("WAVE_API_URL") }));
        }
        if (lire("OM_API_KEY") && lire("OM_MERCHANT_KEY") && lire("OM_WEBHOOK_SECRET")) {
          fournisseurs.set(
            "ORANGE_MONEY",
            new FournisseurOrangeMoney({
              cleApi: lire("OM_API_KEY")!,
              cleMarchand: lire("OM_MERCHANT_KEY")!,
              secretWebhook: lire("OM_WEBHOOK_SECRET")!,
              url: lire("OM_API_URL"),
              chemin: lire("OM_WEBPAY_CHEMIN"),
              devise: lire("OM_DEVISE"),
            }),
          );
        }
        if (lire("PAIEMENTS_SIMULES")) {
          fournisseurs.set("SIMULE", new FournisseurSimule({ secret: lire("PAIEMENT_SIMULE_SECRET"), urlSite: lire("APP_URL") }));
        }
        return fournisseurs;
      },
    },
    PaiementsService,
    FilePaiements,
  ],
})
export class PaiementsModule {}
