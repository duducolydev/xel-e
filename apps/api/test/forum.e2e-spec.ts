import type { INestApplication } from "@nestjs/common";
import { PrismaClient, type Role } from "@prisma/client";
import type { ElementModeration, EtatForum, PageForum, SujetForumDetail } from "@xel-e/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOT_DE_PASSE_DEMO, seedAll } from "../prisma/seed";
import { hasherMotDePasse } from "../src/auth/password";
import { connecter, creerApp, viderBase, viderLimiteurs } from "./helpers";

const prisma = new PrismaClient();
let app: INestApplication;
type Agent = Awaited<ReturnType<typeof connecter>>;
let auteur: Agent; // fatou_demo (élève de démo, 3e)
let repondant: Agent;
let temoin1: Agent;
let temoin2: Agent;
let prof: Agent;
let admin: Agent;
const anonyme = () => request(app.getHttpServer());

// Fichier de test antivirus standard (EICAR), reconstitué à l'exécution : ainsi le dépôt ne contient
// pas la signature et l'antivirus du poste de développement ne met pas ce fichier en quarantaine.
const EICAR = ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-", "ANTIVIRUS-TEST-FILE!$H+H*"].join("");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function creerCompte(email: string, role: Role, surcharge: Record<string, unknown> = {}) {
  const niveau = await prisma.niveau.findUniqueOrThrow({ where: { libelle: "3e" } });
  await prisma.user.create({
    data: {
      email,
      role,
      nomComplet: `Compte ${email}`,
      motDePasseHash: await hasherMotDePasse(MOT_DE_PASSE_DEMO),
      emailConfirmeLe: new Date(),
      naissanceMois: 1,
      naissanceAnnee: 2010,
      niveauId: role === "ELEVE" ? niveau.id : null,
      ...surcharge,
    },
  });
  return connecter(app, email, MOT_DE_PASSE_DEMO);
}

beforeAll(async () => {
  await viderBase(prisma);
  await seedAll(prisma);
  await viderLimiteurs();
  app = await creerApp();
  auteur = await connecter(app, "eleve.demo@xele.sn", MOT_DE_PASSE_DEMO);
  prof = await connecter(app, "prof.demo@xele.sn", MOT_DE_PASSE_DEMO);
  admin = await connecter(app, "admin.demo@xele.sn", MOT_DE_PASSE_DEMO);
  repondant = await creerCompte("repondant@xele.sn", "ELEVE");
  temoin1 = await creerCompte("temoin1@xele.sn", "ELEVE", { pseudonyme: "temoin_un" });
  temoin2 = await creerCompte("temoin2@xele.sn", "ELEVE", { pseudonyme: "temoin_deux" });
}, 60_000);

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("forum modéré : parcours complet", () => {
  let sujetId: string;
  let reponseId: string;
  let pieceId: string;

  it("un élève sans pseudonyme doit en choisir un avant de publier", async () => {
    const etat = (await repondant.get("/forum/etat").expect(200)).body as EtatForum;
    expect(etat).toMatchObject({ acces: true, pseudonyme: null, liensAutorises: false });

    await repondant.post("/forum/sujets").send({ niveau: "3e", matiere: "Maths", titre: "Une question", contenu: "Bonjour" }).expect(400);
    await repondant.put("/forum/pseudonyme").send({ pseudonyme: "fatou_demo" }).expect(409);
    await repondant.put("/forum/pseudonyme").send({ pseudonyme: "moussa-3e" }).expect(200);
  });

  it("l'antivirus refuse un fichier infecté (422) et le type est vérifié sur le contenu (400)", async () => {
    const infecte = await auteur.post("/forum/pieces-jointes").attach("fichier", Buffer.from(EICAR), "cours.pdf").expect(422);
    expect(infecte.body.message).toMatch(/menace/);

    await auteur.post("/forum/pieces-jointes").attach("fichier", Buffer.from("<svg onload=alert(1)>"), "image.png").expect(400);
    await auteur.post("/forum/pieces-jointes").attach("fichier", Buffer.alloc(5 * 1024 * 1024 + 10, 1), "gros.png").expect(413);
  });

  it("l'élève crée un sujet avec une image analysée par l'antivirus", async () => {
    const piece = await auteur.post("/forum/pieces-jointes").attach("fichier", PNG, "Ma figure.png").expect(201);
    pieceId = piece.body.id;
    expect(piece.body).toMatchObject({ nom: "Ma figure.png", type: "image/png" });

    const sujet = await auteur
      .post("/forum/sujets")
      .send({ niveau: "3e", matiere: "Maths", titre: "Je bloque sur Thalès", contenu: "Comment trouver AN ?", piecesJointes: [pieceId] })
      .expect(201);
    sujetId = sujet.body.id;
    expect(sujet.body.messages[0]).toMatchObject({ contenu: "Comment trouver AN ?", estMoi: true, piecesJointes: [{ id: pieceId }] });

    const page = (await repondant.get("/forum/niveaux/3e/maths").expect(200)).body as PageForum;
    expect(page.sujets[0]).toMatchObject({ id: sujetId, titre: "Je bloque sur Thalès", auteur: { pseudonyme: "fatou_demo", badge: null } });
  });

  it("une pièce jointe déjà utilisée ou appartenant à un autre est refusée", async () => {
    await repondant.post(`/forum/sujets/${sujetId}/messages`).send({ contenu: "Je réutilise", piecesJointes: [pieceId] }).expect(400);
  });

  it("le filtre bloque insultes et liens externes d'un élève", async () => {
    const insulte = await repondant.post(`/forum/sujets/${sujetId}/messages`).send({ contenu: "T'es nul, connard" }).expect(400);
    expect(insulte.body.message).toMatch(/terme interdit/);
    const lien = await repondant.post(`/forum/sujets/${sujetId}/messages`).send({ contenu: "regarde sur www.exemple.com" }).expect(400);
    expect(lien.body.message).toMatch(/liens vers d'autres sites/);
  });

  it("un autre élève répond ; un professeur répond avec un lien, sous badge « Professeur »", async () => {
    const reponse = await repondant.post(`/forum/sujets/${sujetId}/messages`).send({ contenu: "Utilise les rapports de Thalès !" }).expect(201);
    reponseId = (reponse.body as SujetForumDetail).messages.at(-1)!.id;

    await prof.put("/forum/pseudonyme").send({ pseudonyme: "pr_moussa" }).expect(200);
    const reponseProf = await prof
      .post(`/forum/sujets/${sujetId}/messages`)
      .send({ contenu: "Revois la leçon : https://fr.wikipedia.org/wiki/Théorème_de_Thalès" })
      .expect(201);
    expect((reponseProf.body as SujetForumDetail).messages.at(-1)!.auteur).toEqual({ pseudonyme: "pr_moussa", badge: "PROFESSEUR" });

    const notifs = await prisma.notification.findMany({ where: { utilisateur: { email: "eleve.demo@xele.sn" }, type: "FORUM" } });
    expect(notifs).toHaveLength(2);
  });

  it("l'API ne divulgue ni email, ni nom complet, ni identifiant de compte", async () => {
    const sujet = await temoin1.get(`/forum/sujets/${sujetId}`).expect(200);
    const json = JSON.stringify(sujet.body);

    expect(json).not.toMatch(/@xele\.sn|Fatou Élève Démo|Compte repondant|Moussa Professeur Démo|auteurId|nomComplet|email/);
    const ids = await prisma.user.findMany({ select: { id: true } });
    for (const { id } of ids) expect(json).not.toContain(id);
  });

  it("la pièce jointe se télécharge avec des en-têtes sûrs", async () => {
    const fichier = await temoin1.get(`/forum/pieces-jointes/${pieceId}`).expect(200);
    expect(fichier.headers["content-type"]).toBe("image/png");
    expect(fichier.headers["x-content-type-options"]).toBe("nosniff");
    expect(fichier.headers["content-security-policy"]).toContain("sandbox");
    expect(Buffer.from(fichier.body as Buffer).equals(PNG)).toBe(true);
  });

  it("on ne signale pas son propre message ; un compte ne compte qu'une fois", async () => {
    await repondant.post(`/forum/messages/${reponseId}/signaler`).send({}).expect(400);
    expect((await auteur.post(`/forum/messages/${reponseId}/signaler`).send({ motif: "Moquerie" }).expect(200)).body).toEqual({ masque: false });
    expect((await auteur.post(`/forum/messages/${reponseId}/signaler`).send({}).expect(200)).body).toEqual({ masque: false });
    expect((await temoin1.post(`/forum/messages/${reponseId}/signaler`).send({}).expect(200)).body).toEqual({ masque: false });
  });

  it("au 3e signalement (comptes distincts), la réponse est masquée en attendant la modération", async () => {
    expect((await temoin2.post(`/forum/messages/${reponseId}/signaler`).send({}).expect(200)).body).toEqual({ masque: true });

    const vuParAutre = (await temoin1.get(`/forum/sujets/${sujetId}`).expect(200)).body as SujetForumDetail;
    expect(vuParAutre.messages.find((m) => m.id === reponseId)).toMatchObject({ etat: "masque", contenu: null });
    const vuParAuteur = (await repondant.get(`/forum/sujets/${sujetId}`).expect(200)).body as SujetForumDetail;
    expect(vuParAuteur.messages.find((m) => m.id === reponseId)).toMatchObject({ etat: "masque", contenu: "Utilise les rapports de Thalès !" });

    const file = (await admin.get("/admin/moderation").expect(200)).body as ElementModeration[];
    expect(file[0]).toMatchObject({ messageId: reponseId, etat: "masque", signalements: 3, motifs: ["Moquerie"] });
    expect(file[0]!.auteur.nomComplet).toBe("Compte repondant@xele.sn");
  });

  it("l'admin innocente : la réponse réapparaît et n'est plus masquée automatiquement", async () => {
    await admin.post(`/admin/moderation/messages/${reponseId}/restaurer`).expect(204);
    expect((await admin.get("/admin/moderation").expect(200)).body).toEqual([]);

    const vu = (await temoin1.get(`/forum/sujets/${sujetId}`).expect(200)).body as SujetForumDetail;
    expect(vu.messages.find((m) => m.id === reponseId)).toMatchObject({ etat: "visible", contenu: "Utilise les rapports de Thalès !" });

    const prof2 = prof;
    await prof2.post(`/forum/messages/${reponseId}/signaler`).send({}).expect(200);
    const file = (await admin.get("/admin/moderation").expect(200)).body as ElementModeration[];
    expect(file[0]).toMatchObject({ messageId: reponseId, etat: "visible", verifie: true, signalements: 1 });
  });

  it("l'admin supprime un message : il disparaît et son auteur est prévenu", async () => {
    const reponse = await temoin1.post(`/forum/sujets/${sujetId}/messages`).send({ contenu: "Message hors sujet" }).expect(201);
    const id = (reponse.body as SujetForumDetail).messages.at(-1)!.id;
    for (const agent of [auteur, repondant, temoin2]) await agent.post(`/forum/messages/${id}/signaler`).send({}).expect(200);

    await admin.delete(`/admin/moderation/messages/${id}`).expect(204);

    const vu = (await temoin1.get(`/forum/sujets/${sujetId}`).expect(200)).body as SujetForumDetail;
    expect(vu.messages.find((m) => m.id === id)).toMatchObject({ etat: "supprime", contenu: null });
    const notif = await prisma.notification.findFirst({ where: { utilisateur: { email: "temoin1@xele.sn" }, type: "MODERATION" } });
    expect(notif?.contenu).toMatch(/supprimé par la modération/);
    await admin.delete(`/admin/moderation/messages/${id}`).expect(404);
  });

  it("l'admin complète la liste des termes interdits", async () => {
    const terme = await admin.post("/admin/moderation/termes").send({ terme: "nul à chier" }).expect(201);
    await admin.post("/admin/moderation/termes").send({ terme: "Nul à Chier" }).expect(409);
    await repondant.post(`/forum/sujets/${sujetId}/messages`).send({ contenu: "C'est nul à chier" }).expect(400);

    await admin.delete(`/admin/moderation/termes/${terme.body.id}`).expect(204);
    await repondant.post(`/forum/sujets/${sujetId}/messages`).send({ contenu: "C'est nul à chier" }).expect(201);
  });

  it("l'admin retire un sujet entier", async () => {
    await admin.delete(`/admin/moderation/sujets/${sujetId}`).expect(204);
    await temoin1.get(`/forum/sujets/${sujetId}`).expect(404);
    await temoin1.get(`/forum/pieces-jointes/${pieceId}`).expect(404);
  });
});

describe("forum : qui y a accès", () => {
  it("un élève de moins de 15 ans sans accord parental ne voit pas le forum", async () => {
    const jeune = await creerCompte("jeune@xele.sn", "ELEVE", { naissanceAnnee: 2014, pseudonyme: "jeune_3e" });

    const etat = (await jeune.get("/forum/etat").expect(200)).body as EtatForum;
    expect(etat).toMatchObject({ acces: false, raison: expect.stringMatching(/ton parent/) });
    await jeune.get("/forum/niveaux/3e/maths").expect(403);
    await jeune.post("/forum/pieces-jointes").attach("fichier", PNG, "a.png").expect(403);

    await prisma.user.update({ where: { email: "jeune@xele.sn" }, data: { consentementParentalLe: new Date() } });
    await jeune.get("/forum/niveaux/3e/maths").expect(200);
  });

  it("un compte dont l'email n'est pas confirmé ne peut pas lire ni poster", async () => {
    const nonConfirme = await creerCompte("non.confirme@xele.sn", "ELEVE", { emailConfirmeLe: null, pseudonyme: "pas_confirme" });

    await nonConfirme.get("/forum/niveaux/3e/maths").expect(403);
  });

  it("les parents et les visiteurs n'y ont pas accès", async () => {
    const parent = await connecter(app, "parent.demo@xele.sn", MOT_DE_PASSE_DEMO);
    await parent.get("/forum/niveaux/3e/maths").expect(403);
    await anonyme().get("/forum/niveaux/3e/maths").expect(401);
    await anonyme().get("/forum/etat").expect(401);
  });

  it("seule l'administration accède à la modération", async () => {
    await prof.get("/admin/moderation").expect(403);
    await temoin1.get("/admin/moderation/termes").expect(403);
  });
});
