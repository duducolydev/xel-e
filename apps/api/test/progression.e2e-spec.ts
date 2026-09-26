import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import type { QuizPublic, TableauDeBordProgression } from "@xel-e/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedProgressionDemo } from "../prisma/seed-progression";
import { MOT_DE_PASSE_DEMO, seedAll } from "../prisma/seed";
import { connecter, creerApp, viderBase, viderLimiteurs } from "./helpers";

const prisma = new PrismaClient();
let app: INestApplication;
let eleve: Awaited<ReturnType<typeof connecter>>;
const LECON = "3e-svt-chapitre-2-lecon-1";
const BONNES: Record<string, string[] | boolean | string> = { QCM: ["b"], VRAI_FAUX: true, REPONSE_COURTE: "4" };

// Recoupe le tableau de bord de l'API avec les données brutes de la base.
async function recouper(utilisateurId: string, tableau: TableauDeBordProgression) {
  const [xp, badges, lecons, nonLues, user] = await Promise.all([
    prisma.gainXp.aggregate({ where: { utilisateurId }, _sum: { xp: true } }),
    prisma.badgeUtilisateur.count({ where: { utilisateurId } }),
    prisma.progression.count({ where: { utilisateurId, termineLe: { not: null } } }),
    prisma.notification.count({ where: { utilisateurId, lu: false } }),
    prisma.user.findUniqueOrThrow({ where: { id: utilisateurId } }),
  ]);
  expect(tableau.xpTotal).toBe(xp._sum.xp ?? 0);
  expect(tableau.badges.filter((b) => b.obtenuLe).length).toBe(badges);
  expect(tableau.activites.filter((a) => a.type === "lecon").length).toBe(lecons);
  expect(tableau.notificationsNonLues).toBe(nonLues);
  expect(tableau.serie.record).toBe(user.serieRecord);
}

beforeAll(async () => {
  await viderBase(prisma);
  await seedAll(prisma);
  await viderLimiteurs();
  app = await creerApp();
  await request(app.getHttpServer())
    .post("/auth/inscription/eleve")
    .send({
      nomComplet: "Khady Sarr",
      identifiant: "khady.progression",
      niveau: "3e",
      naissanceMois: 1,
      naissanceAnnee: 2010,
      motDePasse: "motdepasse1",
    })
    .expect(201);
  eleve = await connecter(app, "khady.progression", "motdepasse1");
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("progression d'un nouvel élève", () => {
  let utilisateurId: string;

  it("part de zéro", async () => {
    utilisateurId = (await eleve.get("/auth/moi").expect(200)).body.id;
    const tableau = (await eleve.get("/progression/tableau-de-bord").expect(200)).body as TableauDeBordProgression;

    expect(tableau).toMatchObject({ niveau: "3e", xpTotal: 0, xpSemaine: 0, serie: { actuelle: 0, record: 0 } });
    expect(tableau.matieres.map((m) => [m.slug, m.pourcentage])).toEqual([
      ["maths", 0],
      ["pc", 0],
      ["svt", 0],
    ]);
    expect(tableau.badges.every((b) => b.obtenuLe === null)).toBe(true);
  });

  it("terminer une leçon rapporte 10 XP et le badge « Première leçon », une seule fois", async () => {
    const premiere = await eleve.post(`/progression/lecons/${LECON}/terminer`).expect(200);
    const seconde = await eleve.post(`/progression/lecons/${LECON}/terminer`).expect(200);

    expect(premiere.body).toMatchObject({ dejaTerminee: false, xp: 10, badges: [{ code: "premiere-lecon" }] });
    expect(seconde.body).toEqual({ dejaTerminee: true, xp: 0, badges: [] });
    expect((await eleve.get(`/progression/lecons/${LECON}`).expect(200)).body).toMatchObject({ terminee: true });
  });

  it("réussir le quiz à 100 % rapporte 30 XP, enregistrés sur la tentative", async () => {
    const quiz = (await eleve.get(`/quiz/lecons/${LECON}`).expect(200)).body as QuizPublic;
    const tentative = (await eleve.post(`/quiz/lecons/${LECON}/tentatives`).expect(200)).body;
    for (const question of quiz.questions) {
      await eleve.put(`/quiz/tentatives/${tentative.id}/reponses/${question.id}`).send({ reponse: BONNES[question.type] }).expect(204);
    }

    const resultat = await eleve.post(`/quiz/tentatives/${tentative.id}/soumettre`).expect(200);

    expect(resultat.body).toMatchObject({ score: 100, xpGagne: 30 });
    expect((await eleve.get(`/quiz/tentatives/${tentative.id}`).expect(200)).body.xpGagne).toBe(30);
  });

  it("le tableau de bord reflète la progression, l'XP, la série et les badges", async () => {
    const tableau = (await eleve.get("/progression/tableau-de-bord").expect(200)).body as TableauDeBordProgression;

    expect(tableau).toMatchObject({ xpTotal: 40, xpSemaine: 40, serie: { actuelle: 1, record: 1 }, notificationsNonLues: 3 });
    const svt = tableau.matieres.find((m) => m.slug === "svt");
    expect(svt?.chapitres.find((c) => c.titre === "Chapitre 2")).toMatchObject({
      leconsTerminees: 1,
      leconsTotal: 3,
      pourcentage: 33,
      complet: false,
    });
    expect(tableau.badges.filter((b) => b.obtenuLe).map((b) => b.code).sort()).toEqual([
      "premier-quiz-reussi",
      "premiere-lecon",
      "sans-faute",
    ]);
    expect(tableau.activites.map((a) => a.type).sort()).toEqual(["lecon", "quiz"]);
    await recouper(utilisateurId, tableau);
  });

  it("refaire le quiz ne rapporte plus d'XP", async () => {
    const tentative = (await eleve.post(`/quiz/lecons/${LECON}/tentatives`).expect(200)).body;
    const resultat = await eleve.post(`/quiz/tentatives/${tentative.id}/soumettre`).expect(200);

    expect(resultat.body.xpGagne).toBe(0);
    expect((await eleve.get("/progression/tableau-de-bord")).body.xpTotal).toBe(40);
  });

  it("marque les notifications comme lues", async () => {
    await eleve.post("/progression/notifications/lues").expect(204);
    expect((await eleve.get("/progression/tableau-de-bord")).body.notificationsNonLues).toBe(0);
  });
});

describe("classement", () => {
  it("n'inclut personne par défaut, puis l'élève qui l'active sous pseudonyme", async () => {
    const avant = (await eleve.get("/progression/classement").expect(200)).body;
    expect(avant).toMatchObject({ niveau: "3e", participe: false, monRang: null });

    await eleve.put("/progression/classement").send({ actif: true, pseudonyme: "khady_sn" }).expect(204);

    const apres = (await eleve.get("/progression/classement").expect(200)).body;
    expect(apres.participe).toBe(true);
    expect(apres.monRang).toEqual({ rang: 1, pseudonyme: "khady_sn", xp: 40, estMoi: true });
    expect(JSON.stringify(apres)).not.toContain("Khady Sarr");
  });

  it("refuse un pseudonyme invalide ou déjà pris", async () => {
    await eleve.put("/progression/classement").send({ actif: true, pseudonyme: "Khady Sarr!" }).expect(400);
    const pris = await eleve.put("/progression/classement").send({ actif: true, pseudonyme: "fatou_demo" }).expect(409);
    expect(pris.body.erreurs.pseudonyme).toBe("Ce pseudonyme est déjà pris.");
  });

  it("réservé aux élèves", async () => {
    const parent = await connecter(app, "parent.demo@xele.sn", MOT_DE_PASSE_DEMO);
    await parent.put("/progression/classement").send({ actif: true, pseudonyme: "parent_x" }).expect(403);
  });

  it("l'élève peut se retirer à tout moment", async () => {
    await eleve.put("/progression/classement").send({ actif: false }).expect(204);
    const classement = (await eleve.get("/progression/classement").expect(200)).body;
    expect(classement.monRang).toBeNull();
    expect(classement.lignes.some((l: { pseudonyme: string }) => l.pseudonyme === "khady_sn")).toBe(false);
  });
});

describe("comptes de démo", () => {
  it("les chiffres du tableau de bord recoupent les données de la base", async () => {
    await seedProgressionDemo(prisma);
    const demo = await connecter(app, "eleve.demo@xele.sn", MOT_DE_PASSE_DEMO);
    const tableau = (await demo.get("/progression/tableau-de-bord").expect(200)).body as TableauDeBordProgression;
    const { id } = await prisma.user.findUniqueOrThrow({ where: { email: "eleve.demo@xele.sn" } });

    expect(tableau).toMatchObject({ xpTotal: 60, serie: { actuelle: 3, record: 3 } });
    await recouper(id, tableau);

    const classement = (await demo.get("/progression/classement").expect(200)).body;
    expect(classement.lignes.map((l: { pseudonyme: string; rang: number }) => [l.pseudonyme, l.rang])).toEqual([
      ["fatou_demo", 1],
      ["baobab_42", 2],
      ["lion_teranga", 3],
    ]);
  });
});
