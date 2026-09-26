import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  connexionSchema,
  inscriptionEleveSchema,
  inscriptionParentSchema,
  inscriptionProfesseurSchema,
  jetonSchema,
  motDePasseOublieSchema,
  reinitialisationMotDePasseSchema,
  type ConnexionDto,
  type InscriptionEleveDto,
  type InscriptionParentDto,
  type InscriptionProfesseurDto,
  type JetonDto,
  type MotDePasseOublieDto,
  type ReinitialisationMotDePasseDto,
  type UtilisateurCourant,
} from "@xel-e/shared";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { Env } from "../config/env";
import { AuthService, MESSAGE_REINITIALISATION_DEMANDEE } from "./auth.service";
import { COOKIE_REFRESH, definirCookiesSession, effacerCookiesSession } from "./cookies";
import { CurrentUser, Public, type UtilisateurAuthentifie } from "./decorators";
import { LimiterDebit } from "./rate-limit";

const QUART_HEURE = 15 * 60;
const HEURE = 60 * 60;

@Controller("auth")
export class AuthController {
  private readonly cookiesSecurises: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.cookiesSecurises = config.get("NODE_ENV", { infer: true }) === "production";
  }

  @Public()
  @LimiterDebit({ nom: "inscription", max: 50, fenetreSecondes: HEURE })
  @Post("inscription/eleve")
  inscrireEleve(@Body(new ZodValidationPipe(inscriptionEleveSchema)) dto: InscriptionEleveDto) {
    return this.auth.inscrireEleve(dto);
  }

  @Public()
  @LimiterDebit({ nom: "inscription", max: 50, fenetreSecondes: HEURE })
  @Post("inscription/professeur")
  inscrireProfesseur(
    @Body(new ZodValidationPipe(inscriptionProfesseurSchema)) dto: InscriptionProfesseurDto,
  ) {
    return this.auth.inscrireProfesseur(dto);
  }

  @Public()
  @LimiterDebit({ nom: "inscription", max: 50, fenetreSecondes: HEURE })
  @Post("inscription/parent")
  inscrireParent(@Body(new ZodValidationPipe(inscriptionParentSchema)) dto: InscriptionParentDto) {
    return this.auth.inscrireParent(dto);
  }

  @Public()
  @LimiterDebit({ nom: "connexion", max: 100, fenetreSecondes: QUART_HEURE })
  @Post("connexion")
  @HttpCode(HttpStatus.OK)
  async connecter(
    @Body(new ZodValidationPipe(connexionSchema)) dto: ConnexionDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ utilisateur: UtilisateurCourant }> {
    const { jetons, utilisateur } = await this.auth.connecter(dto, req.ip ?? "inconnue");
    definirCookiesSession(res, jetons, this.cookiesSecurises);
    return { utilisateur };
  }

  @Public()
  @Post("rafraichir")
  @HttpCode(HttpStatus.NO_CONTENT)
  async rafraichir(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token: unknown = req.cookies?.[COOKIE_REFRESH];
    if (typeof token !== "string") {
      throw new UnauthorizedException("Ta session a expiré. Reconnecte-toi.");
    }
    try {
      definirCookiesSession(res, await this.auth.rafraichir(token), this.cookiesSecurises);
    } catch (error) {
      effacerCookiesSession(res, this.cookiesSecurises);
      throw error;
    }
  }

  @Public()
  @Post("deconnexion")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deconnecter(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token: unknown = req.cookies?.[COOKIE_REFRESH];
    await this.auth.deconnecter(typeof token === "string" ? token : undefined);
    effacerCookiesSession(res, this.cookiesSecurises);
  }

  @Public()
  @Post("confirmer-email")
  @HttpCode(HttpStatus.OK)
  async confirmerEmail(@Body(new ZodValidationPipe(jetonSchema)) dto: JetonDto) {
    await this.auth.confirmerEmail(dto.token);
    return { message: "Ton adresse email est confirmée." };
  }

  @Public()
  @Post("consentement-parental")
  @HttpCode(HttpStatus.OK)
  async confirmerConsentement(@Body(new ZodValidationPipe(jetonSchema)) dto: JetonDto) {
    await this.auth.confirmerConsentementParental(dto.token);
    return { message: "Merci, votre accord a bien été enregistré." };
  }

  @Public()
  @LimiterDebit({ nom: "mot-de-passe-oublie", max: 20, fenetreSecondes: QUART_HEURE })
  @Post("mot-de-passe-oublie")
  @HttpCode(HttpStatus.ACCEPTED)
  async demanderReinitialisation(
    @Body(new ZodValidationPipe(motDePasseOublieSchema)) dto: MotDePasseOublieDto,
  ) {
    await this.auth.demanderReinitialisation(dto.login);
    return { message: MESSAGE_REINITIALISATION_DEMANDEE };
  }

  @Public()
  @LimiterDebit({ nom: "reinitialisation", max: 20, fenetreSecondes: QUART_HEURE })
  @Post("reinitialiser-mot-de-passe")
  @HttpCode(HttpStatus.OK)
  async reinitialiser(
    @Body(new ZodValidationPipe(reinitialisationMotDePasseSchema)) dto: ReinitialisationMotDePasseDto,
  ) {
    await this.auth.reinitialiserMotDePasse(dto.token, dto.motDePasse);
    return { message: "Ton mot de passe a été modifié. Tu peux te connecter." };
  }

  @Get("moi")
  moi(@CurrentUser() utilisateur: UtilisateurAuthentifie): Promise<UtilisateurCourant> {
    return this.auth.profil(utilisateur.id);
  }
}
