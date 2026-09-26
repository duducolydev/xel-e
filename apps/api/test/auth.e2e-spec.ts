import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOT_DE_PASSE_DEMO, seedAll } from "../prisma/seed";
import { COOKIE_ACCES, COOKIE_REFRESH } from "../src/auth/cookies";
import {
  attendreMail,
  connecter,
  cookie,
  creerApp,
  extraireJeton,
  viderBase,
  viderLimiteurs,
  viderMailhog,
} from "./helpers";

const prisma = new PrismaClient();
let app: INestApplication;

const http = () => request(app.getHttpServer());

beforeAll(async () => {
  await viderBase(prisma);
  await seedAll(prisma);
  await viderMailhog();
  await viderLimiteurs();
  app = await creerApp();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("inscription d'un élève de 15 ans ou plus", () => {
  const email = "awa.e2e@xele.sn";

  it("inscription → email de confirmation → confirmation → connexion → profil", async () => {
    await http()
      .post("/auth/inscription/eleve")
      .send({
        nomComplet: "Awa Diop",
        email,
        niveau: "3e",
        naissanceMois: 1,
        naissanceAnnee: 2010,
        motDePasse: "motdepasse1",
      })
      .expect(201);

    const mail = await attendreMail(email, "Confirme ton adresse email");
    expect(mail.corps).toContain("Bonjour Awa Diop");

    const agent = await connecter(app, email, "motdepasse1");
    const avant = await agent.get("/auth/moi").expect(200);
    expect(avant.body).toMatchObject({ emailConfirme: false, accesForum: false });

    await http()
      .post("/auth/confirmer-email")
      .send({ token: extraireJeton(mail.corps) })
      .expect(200);

    const apres = await agent.get("/auth/moi").expect(200);
    expect(apres.body).toMatchObject({
      nomComplet: "Awa Diop",
      role: "ELEVE",
      emailConfirme: true,
      consentementParentalRequis: false,
      accesForum: true,
    });
  });

  it("pose des cookies de session httpOnly", async () => {
    const reponse = await http()
      .post("/auth/connexion")
      .send({ login: email, motDePasse: "motdepasse1" })
      .expect(200);

    expect(cookie(reponse, COOKIE_ACCES)).toMatch(/HttpOnly/);
    expect(cookie(reponse, COOKIE_REFRESH)).toMatch(/HttpOnly/);
    expect(cookie(reponse, COOKIE_ACCES)).toMatch(/SameSite=Lax/);
  });

  it("n'accepte pas deux fois le même lien de confirmation", async () => {
    const mail = await attendreMail(email, "Confirme ton adresse email");

    const reponse = await http()
      .post("/auth/confirmer-email")
      .send({ token: extraireJeton(mail.corps) })
      .expect(400);
    expect(reponse.body.message).toBe("Ce lien est invalide ou a expiré.");
  });

  it("refuse un email déjà utilisé (409)", async () => {
    const reponse = await http()
      .post("/auth/inscription/eleve")
      .send({
        nomComplet: "Autre Awa",
        email,
        niveau: "4e",
        naissanceMois: 1,
        naissanceAnnee: 2010,
        motDePasse: "motdepasse1",
      })
      .expect(409);
    expect(reponse.body.erreurs.email).toBe("Un compte existe déjà avec cette adresse email.");
  });
});

describe("inscription d'un élève de moins de 15 ans (consentement parental)", () => {
  const parent = "maman.ibou@xele.sn";

  it("exige l'email d'un parent", async () => {
    const reponse = await http()
      .post("/auth/inscription/eleve")
      .send({
        nomComplet: "Ibou Fall",
        identifiant: "ibou.sans.parent",
        niveau: "6e",
        naissanceMois: 5,
        naissanceAnnee: 2014,
        motDePasse: "motdepasse1",
      })
      .expect(400);
    expect(reponse.body.erreurs.contactParentEmail).toMatch(/moins de 15 ans/);
  });

  it("garde le forum fermé jusqu'à l'accord du parent, reçu par email", async () => {
    await http()
      .post("/auth/inscription/eleve")
      .send({
        nomComplet: "Ibou Fall",
        identifiant: "ibou.fall",
        niveau: "6e",
        naissanceMois: 5,
        naissanceAnnee: 2014,
        motDePasse: "motdepasse1",
        contactParentEmail: parent,
      })
      .expect(201);

    const agent = await connecter(app, "ibou.fall", "motdepasse1");
    const avant = await agent.get("/auth/moi").expect(200);
    expect(avant.body).toMatchObject({
      email: null,
      identifiant: "ibou.fall",
      consentementParentalRequis: true,
      consentementParentalDonne: false,
      accesForum: false,
    });

    const mail = await attendreMail(parent, "accord pour l'inscription");
    expect(mail.corps).toContain("Ibou Fall");
    await http()
      .post("/auth/consentement-parental")
      .send({ token: extraireJeton(mail.corps) })
      .expect(200);

    const apres = await agent.get("/auth/moi").expect(200);
    expect(apres.body).toMatchObject({ consentementParentalDonne: true, accesForum: true });
  });

  it("envoie la réinitialisation du mot de passe au parent quand l'élève n'a pas d'email", async () => {
    await http().post("/auth/mot-de-passe-oublie").send({ login: "ibou.fall" }).expect(202);

    const mail = await attendreMail(parent, "Réinitialisation du mot de passe");
    expect(mail.corps).toContain("contact parent");
  });
});

describe("validation des entrées", () => {
  it("renvoie des erreurs par champ, en français", async () => {
    const reponse = await http()
      .post("/auth/inscription/eleve")
      .send({ nomComplet: "A", niveau: "2nde", motDePasse: "court" })
      .expect(400);

    expect(reponse.body.message).toBe("Certains champs sont invalides.");
    expect(reponse.body.erreurs).toMatchObject({
      nomComplet: "Le nom doit contenir au moins 2 caractères.",
      niveau: "Choisis ta classe.",
      motDePasse: "Le mot de passe doit contenir au moins 8 caractères.",
    });
  });

  it("exige un email ou un identifiant pour un élève", async () => {
    const reponse = await http()
      .post("/auth/inscription/eleve")
      .send({
        nomComplet: "Sans Login",
        niveau: "3e",
        naissanceMois: 1,
        naissanceAnnee: 2010,
        motDePasse: "motdepasse1",
      })
      .expect(400);
    expect(reponse.body.erreurs.email).toBe("Renseigne une adresse email ou un identifiant.");
  });
});

describe("professeur : validation par un administrateur", () => {
  const email = "moussa.prof@xele.sn";

  it("refuse la connexion tant que le compte n'est pas validé, puis l'accepte", async () => {
    await http()
      .post("/auth/inscription/professeur")
      .send({ nomComplet: "Moussa Ndiaye", email, motDePasse: "motdepasse1" })
      .expect(201);

    const refus = await http()
      .post("/auth/connexion")
      .send({ login: email, motDePasse: "motdepasse1" })
      .expect(403);
    expect(refus.body.message).toMatch(/en attente de validation/);

    const admin = await connecter(app, "admin.demo@xele.sn", MOT_DE_PASSE_DEMO);
    const enAttente = await admin.get("/admin/professeurs/en-attente").expect(200);
    const prof = (enAttente.body as { id: string; email: string }[]).find((p) => p.email === email);
    expect(prof).toBeDefined();

    await admin.post(`/admin/professeurs/${prof?.id}/valider`).expect(204);
    await attendreMail(email, "compte professeur est validé");

    await http().post("/auth/connexion").send({ login: email, motDePasse: "motdepasse1" }).expect(200);
  });
});

describe("session : rotation et déconnexion", () => {
  it("fait tourner le refresh token et garde la session", async () => {
    const connexion = await http()
      .post("/auth/connexion")
      .send({ login: "eleve.demo@xele.sn", motDePasse: MOT_DE_PASSE_DEMO })
      .expect(200);
    const refreshInitial = cookie(connexion, COOKIE_REFRESH)?.split(";")[0] ?? "";

    const rotation = await http().post("/auth/rafraichir").set("Cookie", refreshInitial).expect(204);
    const nouveauRefresh = cookie(rotation, COOKIE_REFRESH)?.split(";")[0] ?? "";
    const nouvelAcces = cookie(rotation, COOKIE_ACCES)?.split(";")[0] ?? "";

    expect(nouveauRefresh).not.toBe(refreshInitial);
    await http().get("/auth/moi").set("Cookie", nouvelAcces).expect(200);
  });

  it("invalide la session à la déconnexion", async () => {
    const agent = await connecter(app, "eleve.demo@xele.sn", MOT_DE_PASSE_DEMO);
    const connexion = await http()
      .post("/auth/connexion")
      .send({ login: "eleve.demo@xele.sn", motDePasse: MOT_DE_PASSE_DEMO });
    const refresh = cookie(connexion, COOKIE_REFRESH)?.split(";")[0] ?? "";

    await http().post("/auth/deconnexion").set("Cookie", refresh).expect(204);

    await http().post("/auth/rafraichir").set("Cookie", refresh).expect(401);
    await agent.get("/auth/moi").expect(200);
  });

  it("refuse le rafraîchissement sans cookie", async () => {
    await http().post("/auth/rafraichir").expect(401);
  });
});

describe("mot de passe oublié", () => {
  const email = "awa.e2e@xele.sn";

  it("répond pareil qu'un compte existe ou non", async () => {
    const inconnu = await http()
      .post("/auth/mot-de-passe-oublie")
      .send({ login: "personne@xele.sn" })
      .expect(202);
    const connu = await http().post("/auth/mot-de-passe-oublie").send({ login: email }).expect(202);

    expect(inconnu.body.message).toBe(connu.body.message);
  });

  it("change le mot de passe et coupe les sessions ouvertes", async () => {
    const connexion = await http()
      .post("/auth/connexion")
      .send({ login: email, motDePasse: "motdepasse1" })
      .expect(200);
    const refresh = cookie(connexion, COOKIE_REFRESH)?.split(";")[0] ?? "";

    const mail = await attendreMail(email, "Réinitialisation du mot de passe");
    await http()
      .post("/auth/reinitialiser-mot-de-passe")
      .send({ token: extraireJeton(mail.corps), motDePasse: "nouveaumdp2" })
      .expect(200);

    await http().post("/auth/rafraichir").set("Cookie", refresh).expect(401);
    await http().post("/auth/connexion").send({ login: email, motDePasse: "motdepasse1" }).expect(401);
    await http().post("/auth/connexion").send({ login: email, motDePasse: "nouveaumdp2" }).expect(200);
  });
});
