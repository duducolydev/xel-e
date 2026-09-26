import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type Niveau, type User } from "@prisma/client";
import {
  calculerAge,
  exigeConsentementParental,
  type ConnexionDto,
  type InscriptionEleveDto,
  type InscriptionParentDto,
  type InscriptionProfesseurDto,
  type UtilisateurCourant,
} from "@xel-e/shared";
import type { Env } from "../config/env";
import { MailService } from "../mail/mail.service";
import {
  emailConfirmation,
  emailConsentementParental,
  emailReinitialisation,
} from "../mail/templates";
import { PrismaService } from "../prisma/prisma.service";
import { calculerAccesForum, consentementParentalRequis } from "./acces-forum";
import { AccessTokenService } from "./access-token.service";
import type { JetonsSession } from "./cookies";
import { JetonVerificationService } from "./jeton-verification.service";
import { hasherMotDePasse, verifierLeurre, verifierMotDePasse } from "./password";
import { LimiteurConnexion } from "./rate-limit";
import { RefreshTokenService } from "./refresh-token.service";

export const AGE_MINIMUM_INSCRIPTION = 8;

export const MESSAGE_IDENTIFIANTS_INCORRECTS = "Identifiant ou mot de passe incorrect.";
export const MESSAGE_PROF_EN_ATTENTE =
  "Ton compte professeur est en attente de validation par l'équipe Xel-E. Tu recevras un email dès qu'il sera validé.";
export const MESSAGE_REINITIALISATION_DEMANDEE =
  "Si un compte correspond, un lien de réinitialisation a été envoyé à son adresse email " +
  "(ou à celle du parent). Sans email enregistré, demande à ton professeur ou à l'administration.";

export interface ResultatConnexion {
  jetons: JetonsSession;
  utilisateur: UtilisateurCourant;
}

function erreursChamps(erreurs: Record<string, string>): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    message: "Certains champs sont invalides.",
    erreurs,
  });
}

@Injectable()
export class AuthService {
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jetons: JetonVerificationService,
    private readonly limiteur: LimiteurConnexion,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get("APP_URL", { infer: true });
  }

  private lien(chemin: string, token: string): string {
    return `${this.appUrl}${chemin}?token=${encodeURIComponent(token)}`;
  }

  private async verifierUnicite(email?: string, identifiant?: string): Promise<void> {
    if (email && (await this.prisma.user.findUnique({ where: { email } }))) {
      throw new ConflictException({
        statusCode: 409,
        message: "Un compte existe déjà avec cette adresse email.",
        erreurs: { email: "Un compte existe déjà avec cette adresse email." },
      });
    }
    if (identifiant && (await this.prisma.user.findUnique({ where: { identifiant } }))) {
      throw new ConflictException({
        statusCode: 409,
        message: "Cet identifiant est déjà pris.",
        erreurs: { identifiant: "Cet identifiant est déjà pris." },
      });
    }
  }

  private async creerUtilisateur(data: Prisma.UserUncheckedCreateInput): Promise<User> {
    try {
      return await this.prisma.user.create({ data });
    } catch (error) {
      // Course entre la vérification d'unicité et l'insertion.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Un compte existe déjà avec ces informations.");
      }
      throw error;
    }
  }

  private async envoyerConfirmationEmail(user: User): Promise<void> {
    if (!user.email) return;
    const token = await this.jetons.creer(user.id, "CONFIRMATION_EMAIL");
    await this.mail.envoyer(
      emailConfirmation(user.email, user.nomComplet, this.lien("/confirmer-email", token)),
    );
  }

  async inscrireEleve(dto: InscriptionEleveDto): Promise<{ id: string }> {
    const maintenant = new Date();
    const age = calculerAge(dto.naissanceMois, dto.naissanceAnnee, maintenant);
    if (age < AGE_MINIMUM_INSCRIPTION) {
      throw erreursChamps({ naissanceAnnee: "Année de naissance invalide." });
    }

    const consentementRequis = exigeConsentementParental(
      dto.naissanceMois,
      dto.naissanceAnnee,
      maintenant,
    );
    if (consentementRequis) {
      if (!dto.contactParentEmail) {
        throw erreursChamps({
          contactParentEmail: "L'email d'un parent est obligatoire pour les élèves de moins de 15 ans.",
        });
      }
      if (dto.contactParentEmail === dto.email) {
        throw erreursChamps({
          contactParentEmail: "L'email du parent doit être différent de ton adresse email.",
        });
      }
    }

    await this.verifierUnicite(dto.email, dto.identifiant);
    const niveau = await this.prisma.niveau.findUnique({ where: { libelle: dto.niveau } });
    if (!niveau) throw erreursChamps({ niveau: "Niveau inconnu." });

    const user = await this.creerUtilisateur({
      role: "ELEVE",
      nomComplet: dto.nomComplet,
      email: dto.email ?? null,
      identifiant: dto.identifiant ?? null,
      motDePasseHash: await hasherMotDePasse(dto.motDePasse),
      niveauId: niveau.id,
      naissanceMois: dto.naissanceMois,
      naissanceAnnee: dto.naissanceAnnee,
      // Minimisation : le contact parent n'est conservé que s'il est requis.
      contactParentEmail: consentementRequis ? (dto.contactParentEmail ?? null) : null,
    });

    await this.envoyerConfirmationEmail(user);
    if (consentementRequis && user.contactParentEmail) {
      const token = await this.jetons.creer(user.id, "CONSENTEMENT_PARENTAL");
      await this.mail.envoyer(
        emailConsentementParental(
          user.contactParentEmail,
          user.nomComplet,
          this.lien("/consentement-parental", token),
        ),
      );
    }
    return { id: user.id };
  }

  async inscrireProfesseur(dto: InscriptionProfesseurDto): Promise<{ id: string }> {
    await this.verifierUnicite(dto.email);
    const user = await this.creerUtilisateur({
      role: "PROFESSEUR",
      statutCompte: "EN_ATTENTE_VALIDATION",
      nomComplet: dto.nomComplet,
      email: dto.email,
      motDePasseHash: await hasherMotDePasse(dto.motDePasse),
    });
    await this.envoyerConfirmationEmail(user);
    return { id: user.id };
  }

  async inscrireParent(dto: InscriptionParentDto): Promise<{ id: string }> {
    await this.verifierUnicite(dto.email);
    const user = await this.creerUtilisateur({
      role: "PARENT",
      nomComplet: dto.nomComplet,
      email: dto.email,
      motDePasseHash: await hasherMotDePasse(dto.motDePasse),
    });
    await this.envoyerConfirmationEmail(user);
    return { id: user.id };
  }

  private trouverParLogin(login: string): Promise<(User & { niveau: Niveau | null }) | null> {
    const critere = login.includes("@") ? { email: login } : { identifiant: login };
    return this.prisma.user.findFirst({ where: { ...critere, deletedAt: null }, include: { niveau: true } });
  }

  private async ouvrirSession(user: User, familleId?: string): Promise<JetonsSession> {
    const refresh = await this.refreshTokens.emettre(user.id, familleId);
    return {
      accessToken: await this.accessTokens.signer({ id: user.id, role: user.role }),
      accessTtlSecondes: this.accessTokens.ttlSecondes,
      refreshToken: refresh.token,
      refreshExpireLe: refresh.expireLe,
    };
  }

  async connecter(dto: ConnexionDto, ip: string): Promise<ResultatConnexion> {
    await this.limiteur.verifier(ip, dto.login);

    const user = await this.trouverParLogin(dto.login);
    const valide = user
      ? await verifierMotDePasse(user.motDePasseHash, dto.motDePasse)
      : await verifierLeurre(dto.motDePasse);
    if (!user || !valide) {
      await this.limiteur.enregistrerEchec(ip, dto.login);
      throw new UnauthorizedException(MESSAGE_IDENTIFIANTS_INCORRECTS);
    }

    await this.limiteur.reinitialiser(ip, dto.login);
    if (user.statutCompte === "EN_ATTENTE_VALIDATION") {
      throw new ForbiddenException(MESSAGE_PROF_EN_ATTENTE);
    }

    return { jetons: await this.ouvrirSession(user), utilisateur: this.versUtilisateurCourant(user) };
  }

  async rafraichir(refreshToken: string): Promise<JetonsSession> {
    const tourne = await this.refreshTokens.faireTourner(refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: tourne.userId } });
    if (!user || user.deletedAt || user.statutCompte !== "ACTIF") {
      await this.refreshTokens.revoquerTout(tourne.userId);
      throw new UnauthorizedException("Ta session a expiré. Reconnecte-toi.");
    }
    return {
      accessToken: await this.accessTokens.signer({ id: user.id, role: user.role }),
      accessTtlSecondes: this.accessTokens.ttlSecondes,
      refreshToken: tourne.token,
      refreshExpireLe: tourne.expireLe,
    };
  }

  async deconnecter(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await this.refreshTokens.revoquerFamille(refreshToken);
  }

  async confirmerEmail(token: string): Promise<void> {
    const userId = await this.jetons.consommer(token, "CONFIRMATION_EMAIL");
    await this.prisma.user.update({ where: { id: userId }, data: { emailConfirmeLe: new Date() } });
  }

  async confirmerConsentementParental(token: string): Promise<void> {
    const userId = await this.jetons.consommer(token, "CONSENTEMENT_PARENTAL");
    await this.prisma.user.update({
      where: { id: userId },
      data: { consentementParentalLe: new Date() },
    });
  }

  async demanderReinitialisation(login: string): Promise<void> {
    const user = await this.trouverParLogin(login);
    const destinataire = user?.email ?? user?.contactParentEmail;
    if (!user || !destinataire) return;

    const token = await this.jetons.creer(user.id, "REINITIALISATION_MOT_DE_PASSE");
    await this.mail.envoyer(
      emailReinitialisation(
        destinataire,
        user.nomComplet,
        this.lien("/reinitialiser-mot-de-passe", token),
        !user.email,
      ),
    );
  }

  async reinitialiserMotDePasse(token: string, motDePasse: string): Promise<void> {
    const userId = await this.jetons.consommer(token, "REINITIALISATION_MOT_DE_PASSE");
    await this.prisma.user.update({
      where: { id: userId },
      data: { motDePasseHash: await hasherMotDePasse(motDePasse) },
    });
    await this.refreshTokens.revoquerTout(userId);
  }

  async profil(userId: string): Promise<UtilisateurCourant> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { niveau: true },
    });
    if (!user) throw new NotFoundException("Compte introuvable.");
    return this.versUtilisateurCourant(user);
  }

  versUtilisateurCourant(user: User & { niveau?: Niveau | null }, maintenant = new Date()): UtilisateurCourant {
    return {
      id: user.id,
      nomComplet: user.nomComplet,
      role: user.role,
      email: user.email,
      identifiant: user.identifiant,
      niveau: user.niveau?.libelle ?? null,
      emailConfirme: user.emailConfirmeLe !== null,
      consentementParentalRequis: consentementParentalRequis(user, maintenant),
      consentementParentalDonne: user.consentementParentalLe !== null,
      accesForum: calculerAccesForum(user, maintenant),
    };
  }
}
