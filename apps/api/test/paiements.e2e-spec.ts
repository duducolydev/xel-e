import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import type { PageAbonnement, PaiementDto } from "@xel-e/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOT_DE_PASSE_DEMO, seedAll } from "../prisma/seed";
import { signerWebhook } from "../src/paiements/regles";
import { connecter, creerApp, viderBase, viderLimiteurs } from "./helpers";

const prisma = new PrismaClient();
let app: INestApplication;
type Agent = Awaited<ReturnType<typeof connecter>>;
let eleve: Agent;
let parent: Agent;
let admin: Agent;
let eleveId: string;
const anonyme = () => request(app.getHttpServer());
const SECRET = process.env.PAIEMENT_SIMULE_SECRET ?? "secret-du-simulateur-de-paiement";
const EXAMEN_PREMIUM = "/bfem/examens/bfem-maths-examen-blanc-2/copies";

beforeAll(async () => {
  await viderBase(prisma);
  await seedAll(prisma);
  await viderLimiteurs();
  app = await creerApp();
  eleve = await connecter(app, "eleve.demo@xele.sn", MOT_DE_PASSE_DEMO);
  parent = await connecter(app, "parent.demo@xele.sn", MOT_DE_PASSE_DEMO);
  admin = await connecter(app, "admin.demo@xele.sn", MOT_DE_PASSE_DEMO);
  eleveId = (await prisma.user.findUniqueOrThrow({ where: { email: "eleve.demo@xele.sn" } })).id;
  const parentId = (await prisma.user.findUniqueOrThrow({ where: { email: "parent.demo@xele.sn" } })).id;
  await prisma.parentLink.create({ data: { parentId, enfantId: eleveId } });
}, 60_000);

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("élève : de l'offre à l'accès Premium", () => {
  let paiementId: string;
  let ref: string;

  it("la page « Mon abonnement » présente l'état gratuit, les offres et les moyens de paiement", async () => {
    const page = (await eleve.get("/abonnement").expect(200)).body as PageAbonnement;

    expect(page.etat).toEqual({ premium: false, jusquau: null, aRenouveler: false });
    expect(page.plans.map((p) => [p.code, p.prixFcfa, p.aConfirmer])).toEqual([
      ["PREMIUM_MENSUEL", 1500, true],
      ["PREMIUM_ANNUEL", 15000, true],
    ]);
    expect(page.moyens.map((m) => m.code)).toEqual(["SIMULE"]);
    await eleve.post(EXAMEN_PREMIUM).expect(403);
  });

  it("l'élève choisit Premium : paiement en attente et checkout simulé", async () => {
    const reponse = await eleve.post("/paiements").send({ plan: "PREMIUM_MENSUEL", fournisseur: "SIMULE" }).expect(201);
    paiementId = reponse.body.paiementId;
    ref = new URL(reponse.body.urlPaiement).searchParams.get("ref")!;

    expect((await eleve.get(`/paiements/${paiementId}`).expect(200)).body).toMatchObject({ statut: "EN_ATTENTE", montant: 1500 });
    expect((await eleve.get(`/paiements/simulateur/${ref}`).expect(200)).body).toMatchObject({ montant: 1500, plan: "Premium mensuel" });
  });

  it("webhook de confirmation ⇒ l'examen blanc premium devient accessible immédiatement", async () => {
    await eleve.post(`/paiements/simulateur/${ref}/payer`).expect(200);

    const paiement = (await eleve.get(`/paiements/${paiementId}`).expect(200)).body as PaiementDto;
    expect(paiement).toMatchObject({ statut: "CONFIRME", numeroRecu: expect.stringMatching(/^XE-\d{4}-000001$/) });
    await eleve.post(EXAMEN_PREMIUM).expect(200);
    expect(((await eleve.get("/abonnement").expect(200)).body as PageAbonnement).etat.premium).toBe(true);
  });

  it("le reçu PDF est téléchargeable", async () => {
    const recu = await eleve.get(`/paiements/${paiementId}/recu`).buffer(true).parse((res, fin) => {
      const morceaux: Buffer[] = [];
      res.on("data", (m: Buffer) => morceaux.push(m));
      res.on("end", () => fin(null, Buffer.concat(morceaux)));
    }).expect(200);

    expect(recu.headers["content-type"]).toBe("application/pdf");
    expect(recu.headers["content-disposition"]).toContain(`recu-${(await prisma.paiement.findUniqueOrThrow({ where: { id: paiementId } })).numeroRecu}.pdf`);
    expect((recu.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("webhooks : signature et idempotence", () => {
  it("un même événement rejoué n'est pas retraité ; une même ref_externe ne crée qu'un paiement", async () => {
    const creation = await eleve.post("/paiements").send({ plan: "PREMIUM_ANNUEL", fournisseur: "SIMULE" }).expect(201);
    const ref = new URL(creation.body.urlPaiement).searchParams.get("ref")!;
    const corps = JSON.stringify({ id: "evt_rejoue", type: "paiement.reussi", data: { id: ref, montant: 15000 } });
    const signature = signerWebhook(SECRET, Math.floor(Date.now() / 1000), corps);
    const envoyer = (contenu: string, entete: string) =>
      anonyme().post("/webhooks/simule").set("Content-Type", "application/json").set("X-Signature-Simulateur", entete).send(contenu);

    expect((await envoyer(corps, signature).expect(200)).body).toEqual({ statut: "traite" });
    expect((await envoyer(corps, signature).expect(200)).body).toEqual({ statut: "deja-traite" });
    const autreEvenement = JSON.stringify({ id: "evt_autre", type: "paiement.reussi", data: { id: ref, montant: 15000 } });
    expect((await envoyer(autreEvenement, signerWebhook(SECRET, Math.floor(Date.now() / 1000), autreEvenement)).expect(200)).body).toEqual({ statut: "traite" });

    const paiement = await prisma.paiement.findUniqueOrThrow({ where: { id: creation.body.paiementId } });
    expect(paiement.statut).toBe("CONFIRME");
    expect(await prisma.abonnement.count({ where: { paiement: { id: paiement.id } } })).toBe(1);
  });

  it("signature invalide ⇒ 401 et aucun effet en base", async () => {
    const avant = { evenements: await prisma.evenementPaiement.count(), abonnements: await prisma.abonnement.count() };
    const corps = JSON.stringify({ id: "evt_faux", type: "paiement.reussi", data: { id: "sim_x", montant: 1500 } });

    await anonyme().post("/webhooks/simule").set("Content-Type", "application/json").set("X-Signature-Simulateur", signerWebhook("mauvais-secret", Math.floor(Date.now() / 1000), corps)).send(corps).expect(401);
    await anonyme().post("/webhooks/simule").set("Content-Type", "application/json").send(corps).expect(401);
    await anonyme().post("/webhooks/wave").set("Content-Type", "application/json").send(corps).expect(404);

    expect({ evenements: await prisma.evenementPaiement.count(), abonnements: await prisma.abonnement.count() }).toEqual(avant);
  });
});

describe("parent payeur, renouvellement et expiration", () => {
  it("un parent lié paie pour son enfant : la période s'enchaîne sans chevauchement", async () => {
    const page = (await parent.get("/abonnement").expect(200)).body as PageAbonnement;
    expect(page.beneficiaire.id).toBe(eleveId);
    const creation = await parent.post("/paiements").send({ plan: "PREMIUM_MENSUEL", fournisseur: "SIMULE", beneficiaireId: eleveId }).expect(201);
    await parent.post(`/paiements/simulateur/${new URL(creation.body.urlPaiement).searchParams.get("ref")}/payer`).expect(200);

    const periodes = await prisma.abonnement.findMany({ where: { utilisateurId: eleveId }, orderBy: { debutLe: "asc" } });
    expect(periodes).toHaveLength(3);
    for (let i = 1; i < periodes.length; i += 1) expect(periodes[i]!.debutLe).toEqual(periodes[i - 1]!.expireLe);
  });

  it("un parent ne paie pas pour un enfant non lié", async () => {
    const autre = await prisma.user.findFirstOrThrow({ where: { role: "PROFESSEUR" } });
    await parent.post("/paiements").send({ plan: "PREMIUM_MENSUEL", fournisseur: "SIMULE", beneficiaireId: autre.id }).expect(403);
  });

  it("expiration simulée ⇒ le contenu premium redevient verrouillé avec un message clair", async () => {
    await prisma.abonnement.updateMany({
      where: { utilisateurId: eleveId },
      data: { debutLe: new Date(Date.now() - 40 * 86_400_000), expireLe: new Date(Date.now() - 60_000) },
    });

    const cycle = await admin.post("/admin/abonnements/cycle").expect(200);
    expect(cycle.body.expires).toBe(3);

    const etat = ((await eleve.get("/abonnement").expect(200)).body as PageAbonnement).etat;
    expect(etat).toMatchObject({ premium: false, jusquau: expect.any(String) });
    const refus = await eleve.post(EXAMEN_PREMIUM).expect(403);
    expect(refus.body.message).toMatch(/réservé aux abonnés Premium/);
    const notification = await prisma.notification.findFirst({ where: { utilisateurId: eleveId, contenu: { contains: "a pris fin" } } });
    expect(notification?.contenu).toMatch(/Tes résultats restent disponibles/);
    // Rétrogradation douce : les copies et résultats sont conservés.
    expect(await prisma.copieExamen.count({ where: { eleveId } })).toBeGreaterThan(0);
  });
});

describe("administration et accès", () => {
  it("l'admin confirme le prix d'une offre", async () => {
    const plan = await admin.patch("/admin/plans/PREMIUM_MENSUEL").send({ prixFcfa: 2000, actif: true }).expect(200);
    expect(plan.body).toMatchObject({ prixFcfa: 2000, aConfirmer: false });
    await admin.patch("/admin/plans/INCONNU").send({ prixFcfa: 2000, actif: true }).expect(404);
  });

  it("les professeurs et les visiteurs n'ont pas de page d'abonnement", async () => {
    const prof = await connecter(app, "prof.demo@xele.sn", MOT_DE_PASSE_DEMO);
    await prof.get("/abonnement").expect(403);
    await anonyme().get("/abonnement").expect(401);
    await eleve.patch("/admin/plans/PREMIUM_MENSUEL").send({ prixFcfa: 1, actif: true }).expect(403);
  });
});
