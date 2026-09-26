import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { User } from "@prisma/client";
import type { InscriptionEleveDto } from "@xel-e/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { MailService } from "../mail/mail.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AccessTokenService } from "./access-token.service";
import { AuthService, MESSAGE_IDENTIFIANTS_INCORRECTS, MESSAGE_PROF_EN_ATTENTE } from "./auth.service";
import type { JetonVerificationService } from "./jeton-verification.service";
import { hasherMotDePasse, verifierMotDePasse } from "./password";
import type { LimiteurConnexion } from "./rate-limit";
import type { RefreshTokenService } from "./refresh-token.service";

function utilisateur(surcharges: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "awa@xele.sn",
    identifiant: null,
    motDePasseHash: "",
    role: "ELEVE",
    nomComplet: "Awa Diop",
    pseudonyme: null,
    statutCompte: "ACTIF",
    emailConfirmeLe: null,
    niveauId: "niveau-3e",
    naissanceMois: 1,
    naissanceAnnee: 2010,
    contactParentEmail: null,
    consentementParentalLe: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...surcharges,
  };
}

function creerService() {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: { data: Partial<User> }) => utilisateur({ ...data, id: "nouveau" })),
      update: vi.fn().mockResolvedValue(undefined),
    },
    niveau: { findUnique: vi.fn().mockResolvedValue({ id: "niveau-4e", libelle: "4e" }) },
  };
  const mail = { envoyer: vi.fn().mockResolvedValue(undefined) };
  const accessTokens = { signer: vi.fn().mockResolvedValue("access-token"), ttlSecondes: 900 };
  const refreshTokens = {
    emettre: vi.fn().mockResolvedValue({ token: "refresh-token", expireLe: new Date("2026-10-26") }),
    faireTourner: vi.fn(),
    revoquerFamille: vi.fn().mockResolvedValue(undefined),
    revoquerTout: vi.fn().mockResolvedValue(undefined),
  };
  const jetons = { creer: vi.fn().mockResolvedValue("jeton-123"), consommer: vi.fn() };
  const limiteur = {
    verifier: vi.fn().mockResolvedValue(undefined),
    enregistrerEchec: vi.fn().mockResolvedValue(undefined),
    reinitialiser: vi.fn().mockResolvedValue(undefined),
  };
  const config = { get: () => "http://app.test" } as unknown as ConfigService<Env, true>;

  const service = new AuthService(
    prisma as unknown as PrismaService,
    mail as unknown as MailService,
    accessTokens as unknown as AccessTokenService,
    refreshTokens as unknown as RefreshTokenService,
    jetons as unknown as JetonVerificationService,
    limiteur as unknown as LimiteurConnexion,
    config,
  );
  return { service, prisma, mail, refreshTokens, jetons, limiteur };
}

const eleveMajeurQuinze: InscriptionEleveDto = {
  nomComplet: "Awa Diop",
  email: "awa@xele.sn",
  niveau: "3e",
  naissanceMois: 1,
  naissanceAnnee: 2010,
  motDePasse: "motdepasse1",
};

const eleveMoinsQuinze: InscriptionEleveDto = {
  nomComplet: "Ibou Fall",
  identifiant: "ibou.fall",
  niveau: "6e",
  naissanceMois: 5,
  naissanceAnnee: 2014,
  motDePasse: "motdepasse1",
};

describe("mots de passe", () => {
  it("hache en argon2id et vérifie le bon mot de passe", async () => {
    const hash = await hasherMotDePasse("motdepasse1");

    expect(hash.startsWith("$argon2id$")).toBe(true);
    await expect(verifierMotDePasse(hash, "motdepasse1")).resolves.toBe(true);
  });

  it("refuse un mauvais mot de passe ou un hash corrompu", async () => {
    const hash = await hasherMotDePasse("motdepasse1");

    await expect(verifierMotDePasse(hash, "motdepasse2")).resolves.toBe(false);
    await expect(verifierMotDePasse("pas-un-hash", "motdepasse1")).resolves.toBe(false);
  });
});

describe("AuthService", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("inscription élève", () => {
    it("inscrit un élève de 15 ans ou plus sans contact parent et envoie la confirmation d'email", async () => {
      const { service, prisma, mail } = creerService();

      await service.inscrireEleve({ ...eleveMajeurQuinze, contactParentEmail: "papa@xele.sn" });

      const data = prisma.user.create.mock.calls[0]?.[0].data;
      expect(data?.contactParentEmail).toBeNull();
      expect(data?.motDePasseHash).toMatch(/^\$argon2id\$/);
      expect(mail.envoyer).toHaveBeenCalledTimes(1);
      expect(mail.envoyer.mock.calls[0]?.[0].destinataire).toBe("awa@xele.sn");
    });

    it("exige l'email d'un parent en dessous de 15 ans", async () => {
      const { service, prisma } = creerService();

      await expect(service.inscrireEleve(eleveMoinsQuinze)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("envoie la demande de consentement au parent en dessous de 15 ans", async () => {
      const { service, prisma, mail, jetons } = creerService();

      await service.inscrireEleve({ ...eleveMoinsQuinze, contactParentEmail: "maman@xele.sn" });

      expect(prisma.user.create.mock.calls[0]?.[0].data.contactParentEmail).toBe("maman@xele.sn");
      expect(jetons.creer).toHaveBeenCalledWith("nouveau", "CONSENTEMENT_PARENTAL");
      expect(mail.envoyer).toHaveBeenCalledTimes(1);
      const email = mail.envoyer.mock.calls[0]?.[0];
      expect(email.destinataire).toBe("maman@xele.sn");
      expect(email.texte).toContain("http://app.test/consentement-parental?token=jeton-123");
    });

    it("refuse que le contact parent soit l'email de l'élève", async () => {
      const { service } = creerService();

      await expect(
        service.inscrireEleve({
          ...eleveMoinsQuinze,
          email: "ibou@xele.sn",
          contactParentEmail: "ibou@xele.sn",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse un âge invraisemblable", async () => {
      const { service } = creerService();

      await expect(
        service.inscrireEleve({ ...eleveMajeurQuinze, naissanceAnnee: 2024 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse un email déjà utilisé", async () => {
      const { service, prisma } = creerService();
      prisma.user.findUnique.mockResolvedValueOnce(utilisateur());

      await expect(service.inscrireEleve(eleveMajeurQuinze)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it("inscrit un professeur en attente de validation", async () => {
    const { service, prisma } = creerService();

    await service.inscrireProfesseur({
      nomComplet: "Moussa Ndiaye",
      email: "moussa@xele.sn",
      motDePasse: "motdepasse1",
    });

    expect(prisma.user.create.mock.calls[0]?.[0].data).toMatchObject({
      role: "PROFESSEUR",
      statutCompte: "EN_ATTENTE_VALIDATION",
    });
  });

  describe("connexion", () => {
    it("ouvre une session avec des identifiants valides et remet le compteur d'échecs à zéro", async () => {
      const { service, prisma, limiteur } = creerService();
      prisma.user.findFirst.mockResolvedValue(
        utilisateur({ motDePasseHash: await hasherMotDePasse("motdepasse1") }),
      );

      const resultat = await service.connecter({ login: "awa@xele.sn", motDePasse: "motdepasse1" }, "1.2.3.4");

      expect(resultat.jetons).toMatchObject({ accessToken: "access-token", refreshToken: "refresh-token" });
      expect(resultat.utilisateur.nomComplet).toBe("Awa Diop");
      expect(limiteur.reinitialiser).toHaveBeenCalledWith("1.2.3.4", "awa@xele.sn");
    });

    it("cherche par identifiant quand le login n'est pas un email", async () => {
      const { service, prisma } = creerService();
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.connecter({ login: "ibou.fall", motDePasse: "x" }, "1.2.3.4"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.findFirst.mock.calls[0]?.[0].where).toMatchObject({ identifiant: "ibou.fall" });
    });

    it("refuse un mauvais mot de passe avec un message neutre et compte l'échec", async () => {
      const { service, prisma, limiteur } = creerService();
      prisma.user.findFirst.mockResolvedValue(
        utilisateur({ motDePasseHash: await hasherMotDePasse("motdepasse1") }),
      );

      await expect(
        service.connecter({ login: "awa@xele.sn", motDePasse: "faux" }, "1.2.3.4"),
      ).rejects.toThrow(MESSAGE_IDENTIFIANTS_INCORRECTS);
      expect(limiteur.enregistrerEchec).toHaveBeenCalledWith("1.2.3.4", "awa@xele.sn");
    });

    it("répond le même message pour un compte inexistant", async () => {
      const { service, limiteur } = creerService();

      await expect(
        service.connecter({ login: "inconnu@xele.sn", motDePasse: "faux" }, "1.2.3.4"),
      ).rejects.toThrow(MESSAGE_IDENTIFIANTS_INCORRECTS);
      expect(limiteur.enregistrerEchec).toHaveBeenCalled();
    });

    it("bloque un professeur en attente de validation", async () => {
      const { service, prisma, refreshTokens } = creerService();
      prisma.user.findFirst.mockResolvedValue(
        utilisateur({
          role: "PROFESSEUR",
          statutCompte: "EN_ATTENTE_VALIDATION",
          motDePasseHash: await hasherMotDePasse("motdepasse1"),
        }),
      );

      const tentative = service.connecter({ login: "awa@xele.sn", motDePasse: "motdepasse1" }, "1.2.3.4");

      await expect(tentative).rejects.toBeInstanceOf(ForbiddenException);
      await expect(tentative).rejects.toThrow(MESSAGE_PROF_EN_ATTENTE);
      expect(refreshTokens.emettre).not.toHaveBeenCalled();
    });

    it("ne vérifie même pas le mot de passe quand le limiteur bloque", async () => {
      const { service, prisma, limiteur } = creerService();
      limiteur.verifier.mockRejectedValue(new Error("429"));

      await expect(
        service.connecter({ login: "awa@xele.sn", motDePasse: "x" }, "1.2.3.4"),
      ).rejects.toThrow("429");
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("session", () => {
    it("rafraîchit la session d'un compte actif", async () => {
      const { service, prisma, refreshTokens } = creerService();
      refreshTokens.faireTourner.mockResolvedValue({
        userId: "user-1",
        token: "refresh-2",
        expireLe: new Date("2026-10-26"),
      });
      prisma.user.findUnique.mockResolvedValue(utilisateur());

      const jetons = await service.rafraichir("refresh-1");

      expect(jetons).toMatchObject({ accessToken: "access-token", refreshToken: "refresh-2" });
    });

    it("coupe toutes les sessions d'un compte supprimé au rafraîchissement", async () => {
      const { service, prisma, refreshTokens } = creerService();
      refreshTokens.faireTourner.mockResolvedValue({ userId: "user-1", token: "r", expireLe: new Date() });
      prisma.user.findUnique.mockResolvedValue(utilisateur({ deletedAt: new Date() }));

      await expect(service.rafraichir("refresh-1")).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refreshTokens.revoquerTout).toHaveBeenCalledWith("user-1");
    });

    it("invalide la famille de jetons à la déconnexion", async () => {
      const { service, refreshTokens } = creerService();

      await service.deconnecter("refresh-1");

      expect(refreshTokens.revoquerFamille).toHaveBeenCalledWith("refresh-1");
    });

    it("accepte une déconnexion sans jeton", async () => {
      const { service, refreshTokens } = creerService();

      await expect(service.deconnecter(undefined)).resolves.toBeUndefined();
      expect(refreshTokens.revoquerFamille).not.toHaveBeenCalled();
    });
  });

  describe("réinitialisation du mot de passe", () => {
    it("envoie le lien à l'élève quand il a un email", async () => {
      const { service, prisma, mail } = creerService();
      prisma.user.findFirst.mockResolvedValue(utilisateur());

      await service.demanderReinitialisation("awa@xele.sn");

      expect(mail.envoyer.mock.calls[0]?.[0].destinataire).toBe("awa@xele.sn");
    });

    it("envoie le lien au parent pour un élève sans email", async () => {
      const { service, prisma, mail } = creerService();
      prisma.user.findFirst.mockResolvedValue(
        utilisateur({ email: null, identifiant: "ibou.fall", contactParentEmail: "maman@xele.sn" }),
      );

      await service.demanderReinitialisation("ibou.fall");

      const email = mail.envoyer.mock.calls[0]?.[0];
      expect(email.destinataire).toBe("maman@xele.sn");
      expect(email.texte).toContain("contact parent");
    });

    it("n'envoie rien sans email ni contact parent (l'élève passe par l'administration)", async () => {
      const { service, prisma, mail, jetons } = creerService();
      prisma.user.findFirst.mockResolvedValue(utilisateur({ email: null, identifiant: "moussa" }));

      await service.demanderReinitialisation("moussa");

      expect(jetons.creer).not.toHaveBeenCalled();
      expect(mail.envoyer).not.toHaveBeenCalled();
    });

    it("change le mot de passe et coupe toutes les sessions existantes", async () => {
      const { service, prisma, jetons, refreshTokens } = creerService();
      jetons.consommer.mockResolvedValue("user-1");

      await service.reinitialiserMotDePasse("jeton", "nouveaumdp1");

      const hash = prisma.user.update.mock.calls[0]?.[0].data.motDePasseHash;
      await expect(verifierMotDePasse(hash, "nouveaumdp1")).resolves.toBe(true);
      expect(refreshTokens.revoquerTout).toHaveBeenCalledWith("user-1");
    });
  });

  it("expose l'accès au forum dans le profil courant", () => {
    const { service } = creerService();

    const profil = service.versUtilisateurCourant(
      utilisateur({ naissanceAnnee: 2013, emailConfirmeLe: new Date() }),
    );

    expect(profil).toMatchObject({
      consentementParentalRequis: true,
      consentementParentalDonne: false,
      accesForum: false,
    });
  });
});
