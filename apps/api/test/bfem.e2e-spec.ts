import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import type { AnnaleDto, EtatCopie, ExamenResume, HistoriqueBfem, ResultatCopie, SimulationBfem } from "@xel-e/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOT_DE_PASSE_DEMO, seedAll } from "../prisma/seed";
import { connecter, creerApp, viderBase, viderLimiteurs } from "./helpers";

// Durée raccourcie des examens blancs pour ce fichier (variable lue au démarrage de l'application).
const DUREE_TEST_S = 3;
process.env.EXAMEN_DUREE_TEST_SECONDES = String(DUREE_TEST_S);

const prisma = new PrismaClient();
let app: INestApplication;
type Agent = Awaited<ReturnType<typeof connecter>>;
let eleve: Agent;
let admin: Agent;
let eleveId: string;
const anonyme = () => request(app.getHttpServer());
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF");
const EICAR = ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-", "ANTIVIRUS-TEST-FILE!$H+H*"].join("");

beforeAll(async () => {
  await viderBase(prisma);
  await seedAll(prisma);
  await viderLimiteurs();
  app = await creerApp();
  eleve = await connecter(app, "eleve.demo@xele.sn", MOT_DE_PASSE_DEMO);
  admin = await connecter(app, "admin.demo@xele.sn", MOT_DE_PASSE_DEMO);
  eleveId = (await prisma.user.findUniqueOrThrow({ where: { email: "eleve.demo@xele.sn" } })).id;
}, 60_000);

afterAll(async () => {
  delete process.env.EXAMEN_DUREE_TEST_SECONDES;
  await app.close();
  await prisma.$disconnect();
});

const questionsDe = (etat: EtatCopie) => (etat.terminee ? [] : etat.questions);

describe("examen blanc chronométré", () => {
  let copieId: string;

  it("liste les examens blancs : le premier gratuit, le second premium et verrouillé", async () => {
    const examens = (await eleve.get("/bfem/examens").expect(200)).body as ExamenResume[];

    expect(examens.map((e) => [e.slug, e.premium, e.accessible])).toEqual([
      ["bfem-maths-examen-blanc-1", false, true],
      ["bfem-maths-examen-blanc-2", true, false],
    ]);
    expect(examens[0]).toMatchObject({ pointsTotal: 20, nombreQuestions: 16, epreuve: { code: "MATHS", aVerifier: true } });
  });

  it("garde premium : l'examen premium est refusé sans abonnement", async () => {
    const reponse = await eleve.post("/bfem/examens/bfem-maths-examen-blanc-2/copies").expect(403);
    expect(reponse.body.message).toMatch(/réservé aux abonnés Premium/);
  });

  it("démarre l'examen : le minuteur est fixé par le serveur", async () => {
    const etat = (await eleve.post("/bfem/examens/bfem-maths-examen-blanc-1/copies").expect(200)).body as EtatCopie;
    expect(etat.terminee).toBe(false);
    if (etat.terminee) return;
    copieId = etat.id;

    const duree = new Date(etat.expireLe).getTime() - new Date(etat.demarreLe).getTime();
    expect(duree).toBe(DUREE_TEST_S * 1000);
    expect(JSON.stringify(etat)).not.toMatch(/reponseCorrecte|explication/);

    const [q1, , q3] = questionsDe(etat);
    await eleve.put(`/bfem/copies/${copieId}/reponses/${q1!.id}`).send({ reponse: "1/2" }).expect(204);
    await eleve.put(`/bfem/copies/${copieId}/reponses/${q3!.id}`).send({ reponse: ["b"] }).expect(204);
  });

  it("à la fin du temps, la copie est rendue automatiquement par le serveur (sans action de l'élève)", async () => {
    await pause(DUREE_TEST_S * 1000 + 2500);

    const copie = await prisma.copieExamen.findUniqueOrThrow({ where: { id: copieId } });
    expect(copie.soumiseLe).not.toBeNull();
    expect(copie.soumissionAuto).toBe(true);
  });

  it("une réponse arrivée après la limite est refusée", async () => {
    const etat = (await eleve.get(`/bfem/copies/${copieId}`).expect(200)).body as EtatCopie;
    expect(etat.terminee).toBe(true);
    const question = await prisma.questionExamen.findFirstOrThrow({ where: { examen: { slug: "bfem-maths-examen-blanc-1" }, ordre: 2 } });

    await eleve.put(`/bfem/copies/${copieId}/reponses/${question.id}`).send({ reponse: "4" }).expect(409);
  });

  it("l'écran de résultats donne la note sur 20 et le corrigé", async () => {
    const resultat = (await eleve.get(`/bfem/copies/${copieId}/resultat`).expect(200)).body as ResultatCopie;

    // 1/2 juste (1 pt) + factorisation c) juste (1 pt) sur 20 points ⇒ 2/20.
    expect(resultat).toMatchObject({ soumissionAuto: true, pointsObtenus: 2, pointsTotal: 20, note: 2 });
    expect(resultat.details).toHaveLength(16);
    expect(resultat.details[0]).toMatchObject({ statut: "correcte", explication: expect.stringContaining("1/4") });
  });

  it("la copie d'un élève est invisible des autres (404)", async () => {
    const autre = await connecter(app, "admin.demo@xele.sn", MOT_DE_PASSE_DEMO);
    await autre.get(`/bfem/copies/${copieId}`).expect(404);
  });
});

describe("abonnement accordé, historique et simulation", () => {
  it("l'admin accorde un accès Premium : l'examen n°2 s'ouvre", async () => {
    await admin.post("/admin/abonnements").send({ login: "eleve.demo@xele.sn", jours: 30 }).expect(201);
    const examens = (await eleve.get("/bfem/examens").expect(200)).body as ExamenResume[];
    expect(examens.find((e) => e.premium)?.accessible).toBe(true);
  });

  it("l'élève passe le second examen et rend sa copie avant la fin", async () => {
    const etat = (await eleve.post("/bfem/examens/bfem-maths-examen-blanc-2/copies").expect(200)).body as EtatCopie;
    if (etat.terminee) throw new Error("copie déjà rendue");
    const [q1, q2] = etat.questions;
    await eleve.put(`/bfem/copies/${etat.id}/reponses/${q1!.id}`).send({ reponse: "1" }).expect(204);
    await eleve.put(`/bfem/copies/${etat.id}/reponses/${q2!.id}`).send({ reponse: ["a"] }).expect(204);

    const resultat = (await eleve.post(`/bfem/copies/${etat.id}/soumettre`).expect(200)).body as ResultatCopie;

    expect(resultat).toMatchObject({ soumissionAuto: false, pointsObtenus: 8, pointsTotal: 20, note: 8 });
  });

  it("l'historique montre les deux examens passés avec leurs scores", async () => {
    const historique = (await eleve.get("/bfem/historique").expect(200)).body as HistoriqueBfem;
    const maths = historique.epreuves.find((e) => e.code === "MATHS")!;

    expect(maths.points.map((p) => [p.examen, p.note, p.soumissionAuto])).toEqual([
      ["Examen blanc BFEM n°1 — Mathématiques", 2, true],
      ["Examen blanc BFEM n°2 — Mathématiques", 8, false],
    ]);
  });

  it("simulation : dernière note d'examen blanc + estimations saisies, pondérées", async () => {
    await admin.patch("/admin/bfem/epreuves/MATHS").send({ dureeMinutes: 120, coefficient: 4 }).expect(200);
    await admin.patch("/admin/bfem/epreuves/FRANCAIS").send({ dureeMinutes: null, coefficient: 3 }).expect(200);

    const simulation = (await eleve.put("/bfem/simulation").send({ notes: { FRANCAIS: 13, PC: null } }).expect(200)).body as SimulationBfem;

    expect(simulation.lignes.find((l) => l.code === "MATHS")).toMatchObject({ note: 8, source: "examen", coefficient: 4, aVerifier: false });
    expect(simulation.lignes.find((l) => l.code === "FRANCAIS")).toMatchObject({ note: 13, source: "estimation" });
    // (8×4 + 13×3) / 7 = 71 / 7 = 10,142… → 10,14
    expect(simulation).toMatchObject({ moyenne: 10.14, coefficientsPris: 7, mention: "Passable" });

    await eleve.put("/bfem/simulation").send({ notes: { FRANCAIS: 21 } }).expect(400);
  });
});

describe("banque d'annales", () => {
  let annaleId: string;

  it("l'admin téléverse sujet et corrigé (PDF analysés par l'antivirus)", async () => {
    const annale = await admin
      .post("/admin/bfem/annales")
      .field("epreuve", "MATHS")
      .field("annee", "2025")
      .field("titre", "BFEM 2025 — Mathématiques")
      .field("premium", "false")
      .attach("sujet", PDF, "sujet.pdf")
      .attach("corrige", PDF, "corrige.pdf")
      .expect(201);
    annaleId = (annale.body as AnnaleDto).id;

    await admin
      .post("/admin/bfem/annales")
      .field("epreuve", "MATHS")
      .field("annee", "2024")
      .field("titre", "Infecté")
      .attach("sujet", Buffer.from(EICAR), "sujet.pdf")
      .expect(422);
    await admin.post("/admin/bfem/annales").field("epreuve", "MATHS").field("annee", "2024").field("titre", "Sans sujet").expect(400);
  });

  it("l'élève liste et télécharge sujet et corrigé", async () => {
    const annales = (await eleve.get("/bfem/annales").expect(200)).body as AnnaleDto[];
    expect(annales).toEqual([expect.objectContaining({ id: annaleId, annee: 2025, aUnCorrige: true, accessible: true })]);

    const sujet = await eleve.get(`/bfem/annales/${annaleId}/sujet`).expect(200);
    expect(sujet.headers["content-type"]).toBe("application/pdf");
    expect(sujet.headers["content-disposition"]).toContain("bfem-2025-maths-sujet.pdf");
    await eleve.get(`/bfem/annales/${annaleId}/corrige`).expect(200);
    await eleve.get(`/bfem/annales/${annaleId}/autre`).expect(400);
  });

  it("une annale premium est refusée à un élève sans abonnement", async () => {
    const premium = await admin
      .post("/admin/bfem/annales")
      .field("epreuve", "PC")
      .field("annee", "2025")
      .field("titre", "BFEM 2025 — Sciences physiques")
      .field("premium", "true")
      .attach("sujet", PDF, "sujet.pdf")
      .expect(201);
    await prisma.user.create({
      data: { identifiant: "sans.abonnement", role: "ELEVE", nomComplet: "Sans Abonnement", motDePasseHash: (await prisma.user.findUniqueOrThrow({ where: { id: eleveId } })).motDePasseHash },
    });
    const sansAbonnement = await connecter(app, "sans.abonnement", MOT_DE_PASSE_DEMO);

    await sansAbonnement.get(`/bfem/annales/${premium.body.id}/sujet`).expect(403);
    await eleve.get(`/bfem/annales/${premium.body.id}/sujet`).expect(200);
  });
});

describe("accès au module BFEM", () => {
  it("réservé aux élèves (et à l'administration)", async () => {
    const parent = await connecter(app, "parent.demo@xele.sn", MOT_DE_PASSE_DEMO);
    const prof = await connecter(app, "prof.demo@xele.sn", MOT_DE_PASSE_DEMO);

    await parent.get("/bfem/examens").expect(403);
    await prof.get("/bfem/examens").expect(403);
    await anonyme().get("/bfem/examens").expect(401);
    await eleve.post("/admin/abonnements").send({ login: "eleve.demo@xele.sn", jours: 30 }).expect(403);
    await eleve.patch("/admin/bfem/epreuves/MATHS").send({ dureeMinutes: 10, coefficient: 1 }).expect(403);
  });
});
