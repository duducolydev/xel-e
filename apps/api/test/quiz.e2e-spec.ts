import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import type { QuizPublic } from "@xel-e/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LECON_DEMO, MOT_DE_PASSE_DEMO, seedAll } from "../prisma/seed";
import { connecter, creerApp, viderBase, viderLimiteurs } from "./helpers";

const prisma = new PrismaClient();
let app: INestApplication;
let eleve: Awaited<ReturnType<typeof connecter>>;
let parent: Awaited<ReturnType<typeof connecter>>;
let quiz: QuizPublic;

beforeAll(async () => {
  await viderBase(prisma);
  await seedAll(prisma);
  await viderLimiteurs();
  app = await creerApp();
  eleve = await connecter(app, "eleve.demo@xele.sn", MOT_DE_PASSE_DEMO);
  parent = await connecter(app, "parent.demo@xele.sn", MOT_DE_PASSE_DEMO);
  quiz = (await eleve.get(`/quiz/lecons/${LECON_DEMO.slug}`).expect(200)).body;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const id = (index: number) => quiz.questions[index]?.id ?? "";

describe("quiz public", () => {
  it("exige une session", async () => {
    await request(app.getHttpServer()).get(`/quiz/lecons/${LECON_DEMO.slug}`).expect(401);
  });

  it("ne transmet aucune bonne réponse ni explication avant la soumission", () => {
    expect(quiz.questions).toHaveLength(5);
    expect(quiz.pointsTotal).toBe(7);
    expect(JSON.stringify(quiz)).not.toMatch(/reponseCorrecte|explication|correct/i);
    expect(JSON.stringify(quiz)).not.toContain("√100");
  });

  it("annonce les QCM à plusieurs réponses", () => {
    expect(quiz.questions.map((q) => q.multiple)).toEqual([false, true, undefined, undefined, undefined]);
  });
});

describe("déroulé d'une tentative", () => {
  let tentativeId: string;

  it("démarre une tentative et enregistre les réponses au fil de l'eau", async () => {
    const tentative = await eleve.post(`/quiz/lecons/${LECON_DEMO.slug}/tentatives`).expect(200);
    tentativeId = tentative.body.id;

    await eleve.put(`/quiz/tentatives/${tentativeId}/reponses/${id(0)}`).send({ reponse: ["c"] }).expect(204);
    await eleve.put(`/quiz/tentatives/${tentativeId}/reponses/${id(1)}`).send({ reponse: ["a"] }).expect(204);
  });

  it("reprend la même tentative, réponses et position conservées", async () => {
    const reprise = await eleve.post(`/quiz/lecons/${LECON_DEMO.slug}/tentatives`).expect(200);
    const enCours = await eleve.get(`/quiz/lecons/${LECON_DEMO.slug}/tentative-en-cours`).expect(200);

    expect(reprise.body).toMatchObject({ id: tentativeId, position: 1, reponses: { [id(0)]: ["c"], [id(1)]: ["a"] } });
    expect(enCours.body.tentative.id).toBe(tentativeId);
  });

  it("refuse une réponse mal formée", async () => {
    await eleve.put(`/quiz/tentatives/${tentativeId}/reponses/${id(2)}`).send({ reponse: "peut-être" }).expect(400);
    await eleve.put(`/quiz/tentatives/${tentativeId}/reponses/${id(0)}`).send({ reponse: ["a", "b"] }).expect(400);
  });

  it("un autre compte ne peut ni remplir ni voir cette tentative", async () => {
    await parent.put(`/quiz/tentatives/${tentativeId}/reponses/${id(2)}`).send({ reponse: true }).expect(404);
    await parent.post(`/quiz/tentatives/${tentativeId}/soumettre`).expect(404);
  });

  it("corrige côté serveur à la soumission et renvoie le corrigé", async () => {
    await eleve.put(`/quiz/tentatives/${tentativeId}/reponses/${id(2)}`).send({ reponse: false }).expect(204);
    await eleve.put(`/quiz/tentatives/${tentativeId}/reponses/${id(3)}`).send({ reponse: "10 cm" }).expect(204);
    await eleve.put(`/quiz/tentatives/${tentativeId}/reponses/${id(4)}`).send({ reponse: "HYPOTENUSE" }).expect(204);

    const resultat = await eleve.post(`/quiz/tentatives/${tentativeId}/soumettre`).expect(200);

    expect(resultat.body).toMatchObject({ pointsObtenus: 6, pointsTotal: 7, score: 85.7 });
    expect(resultat.body.details.map((d: { statut: string }) => d.statut)).toEqual([
      "correcte",
      "partielle",
      "correcte",
      "correcte",
      "correcte",
    ]);
    expect(resultat.body.details[3]).toMatchObject({
      bonneReponse: ["10", "10 cm", "10cm"],
      explication: expect.stringContaining("√100"),
    });
  });

  it("n'accepte plus de réponse après la soumission (409)", async () => {
    await eleve.put(`/quiz/tentatives/${tentativeId}/reponses/${id(0)}`).send({ reponse: ["a"] }).expect(409);
    await eleve.post(`/quiz/tentatives/${tentativeId}/soumettre`).expect(409);
  });

  it("relit le corrigé et le montre dans l'historique", async () => {
    const resultat = await eleve.get(`/quiz/tentatives/${tentativeId}`).expect(200);
    const historique = await eleve.get("/quiz/tentatives").expect(200);

    expect(resultat.body.score).toBe(85.7);
    expect(historique.body[0]).toMatchObject({
      id: tentativeId,
      score: 85.7,
      lecon: { slug: LECON_DEMO.slug, titre: LECON_DEMO.titre },
    });
    await parent.get(`/quiz/tentatives/${tentativeId}`).expect(404);
  });

  it("une nouvelle tentative repart de zéro", async () => {
    const nouvelle = await eleve.post(`/quiz/lecons/${LECON_DEMO.slug}/tentatives`).expect(200);

    expect(nouvelle.body.id).not.toBe(tentativeId);
    expect(nouvelle.body.reponses).toEqual({});
  });
});

describe("quiz d'une leçon non publiée", () => {
  it("renvoie 404", async () => {
    const lecon = await prisma.lecon.findUniqueOrThrow({ where: { slug: LECON_DEMO.slug } });
    await prisma.lecon.update({ where: { id: lecon.id }, data: { deletedAt: new Date() } });

    await eleve.get(`/quiz/lecons/${LECON_DEMO.slug}`).expect(404);
    await eleve.post(`/quiz/lecons/${LECON_DEMO.slug}/tentatives`).expect(404);

    await prisma.lecon.update({ where: { id: lecon.id }, data: { deletedAt: null } });
  });
});
