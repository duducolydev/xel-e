import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import type { LeconStudio, QuizBrouillon, TableauStudio } from "@xel-e/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOT_DE_PASSE_DEMO, seedAll } from "../prisma/seed";
import { hasherMotDePasse } from "../src/auth/password";
import { connecter, creerApp, viderBase, viderLimiteurs } from "./helpers";

const prisma = new PrismaClient();
let app: INestApplication;
let prof: Awaited<ReturnType<typeof connecter>>;
let autreProf: Awaited<ReturnType<typeof connecter>>;
let admin: Awaited<ReturnType<typeof connecter>>;
let eleve: Awaited<ReturnType<typeof connecter>>;
const anonyme = () => request(app.getHttpServer());

const CONTENU = `Deux droites parallèles coupées par deux sécantes.

## Énoncé

Si $(MN) \\parallel (BC)$, alors $\\dfrac{AM}{AB} = \\dfrac{AN}{AC} = \\dfrac{MN}{BC}$.
`;

const QUIZ: QuizBrouillon = [
  {
    type: "QCM",
    enonce: "Que faut-il pour appliquer Thalès ?",
    bareme: 2,
    explication: "Le parallélisme est l'hypothèse clé.",
    choix: [
      { id: "a", texte: "Deux droites parallèles", correct: true },
      { id: "b", texte: "Un angle droit", correct: false },
    ],
  },
  { type: "VRAI_FAUX", enonce: "Les rapports sont égaux.", bareme: 1, explication: undefined, reponse: true },
  { type: "REPONSE_COURTE", enonce: "Nom du théorème ?", bareme: 1, explication: undefined, reponsesAcceptees: ["Thalès", "theoreme de thales"] },
];

beforeAll(async () => {
  await viderBase(prisma);
  await seedAll(prisma);
  await viderLimiteurs();
  await prisma.user.create({
    data: {
      email: "prof.autre@xele.sn",
      role: "PROFESSEUR",
      nomComplet: "Autre Professeur",
      motDePasseHash: await hasherMotDePasse(MOT_DE_PASSE_DEMO),
      emailConfirmeLe: new Date(),
    },
  });
  app = await creerApp();
  prof = await connecter(app, "prof.demo@xele.sn", MOT_DE_PASSE_DEMO);
  autreProf = await connecter(app, "prof.autre@xele.sn", MOT_DE_PASSE_DEMO);
  admin = await connecter(app, "admin.demo@xele.sn", MOT_DE_PASSE_DEMO);
  eleve = await connecter(app, "eleve.demo@xele.sn", MOT_DE_PASSE_DEMO);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("studio professeur et circuit de validation", () => {
  let lecon: LeconStudio;

  it("le prof choisit un chapitre existant et crée une leçon en brouillon", async () => {
    const chapitres = (await prof.get("/studio/chapitres").expect(200)).body as { id: string; titre: string; niveau: string; matiere: string }[];
    const chapitre = chapitres.find((c) => c.niveau === "3e" && c.matiere === "Mathématiques");
    expect(chapitre).toBeDefined();

    lecon = (await prof.post("/studio/lecons").send({ chapitreId: chapitre!.id, titre: "Le théorème de Thalès" }).expect(201)).body;

    expect(lecon).toMatchObject({ statut: "BROUILLON", version: 0, auteur: "Moussa Professeur Démo", modifiable: true, quiz: [] });
  });

  it("refuse un chapitre inconnu et un titre trop court", async () => {
    await prof.post("/studio/lecons").send({ chapitreId: "5f0e8f4e-8a7e-4d3c-9b1a-2c3d4e5f6a7b", titre: "Thalès" }).expect(404);
    await prof.post("/studio/lecons").send({ chapitreId: lecon.id, titre: "T" }).expect(400);
  });

  it("rédige le cours et le quiz, avec aperçu du rendu", async () => {
    const apercu = await prof.post("/studio/apercu").send({ contenu: CONTENU }).expect(200);
    expect(apercu.body.sections).toEqual([
      expect.objectContaining({ titre: null }),
      expect.objectContaining({ titre: "Énoncé", html: expect.stringContaining('class="katex"') }),
    ]);

    lecon = (await prof.patch(`/studio/lecons/${lecon.id}`).send({ contenu: CONTENU, quiz: QUIZ }).expect(200)).body;

    expect(lecon).toMatchObject({ contenu: CONTENU, modificationsQuizEnCours: true });
    expect(lecon.quiz).toHaveLength(3);
  });

  it("refuse un quiz mal formé (QCM sans bonne réponse)", async () => {
    const invalide = [{ ...QUIZ[0], choix: [{ id: "a", texte: "A", correct: false }, { id: "b", texte: "B", correct: false }] }];

    const reponse = await prof.patch(`/studio/lecons/${lecon.id}`).send({ quiz: invalide }).expect(400);

    expect(JSON.stringify(reponse.body)).toContain("Coche au moins une bonne réponse.");
  });

  it("un autre professeur ne voit ni ne modifie cette leçon (404)", async () => {
    await autreProf.get(`/studio/lecons/${lecon.id}`).expect(404);
    await autreProf.patch(`/studio/lecons/${lecon.id}`).send({ titre: "Détournée" }).expect(404);
    await autreProf.post(`/studio/lecons/${lecon.id}/soumettre`).expect(404);
    const tableau = (await autreProf.get("/studio").expect(200)).body as TableauStudio;
    expect(tableau.lecons).toEqual([]);
  });

  it("élèves et visiteurs n'ont pas accès au studio", async () => {
    await eleve.get("/studio").expect(403);
    await eleve.post("/studio/apercu").send({ contenu: "x" }).expect(403);
    await anonyme().get("/studio").expect(401);
  });

  it("le brouillon reste invisible des élèves", async () => {
    await eleve.get(`/lecons/${lecon.slug}`).expect(404);
  });

  it("le prof soumet : la leçon est verrouillée et arrive dans la file de revue", async () => {
    lecon = (await prof.post(`/studio/lecons/${lecon.id}/soumettre`).expect(200)).body;
    expect(lecon).toMatchObject({ statut: "EN_REVUE", modifiable: false });
    expect(lecon.soumisLe).not.toBeNull();

    await prof.patch(`/studio/lecons/${lecon.id}`).send({ titre: "Changement de dernière minute" }).expect(409);
    await prof.post(`/studio/lecons/${lecon.id}/soumettre`).expect(409);

    const file = (await admin.get("/admin/revue").expect(200)).body as { id: string; auteur: string }[];
    expect(file).toEqual([expect.objectContaining({ id: lecon.id, auteur: "Moussa Professeur Démo" })]);
    const notificationsAdmin = (await admin.get("/studio").expect(200)).body as TableauStudio;
    expect(notificationsAdmin.notifications[0]?.contenu).toContain("Nouvelle leçon à relire : « Le théorème de Thalès »");
  });

  it("un professeur ne peut ni publier ni refuser, même sa propre leçon", async () => {
    await prof.post(`/admin/lecons/${lecon.id}/publier`).expect(403);
    await prof.post(`/admin/lecons/${lecon.id}/rejeter`).send({ commentaire: "Je me refuse moi-même." }).expect(403);
    await prof.get("/admin/revue").expect(403);
  });

  it("l'admin relit la leçon et son quiz, puis la refuse avec un commentaire obligatoire", async () => {
    const relue = (await admin.get(`/studio/lecons/${lecon.id}`).expect(200)).body as LeconStudio;
    expect(relue.quiz[0]).toMatchObject({ choix: [expect.objectContaining({ correct: true }), expect.objectContaining({ correct: false })] });

    await admin.post(`/admin/lecons/${lecon.id}/rejeter`).send({ commentaire: "court" }).expect(400);
    await admin
      .post(`/admin/lecons/${lecon.id}/rejeter`)
      .send({ commentaire: "Ajoute un exemple chiffré après l'énoncé." })
      .expect(200);

    await admin.post(`/admin/lecons/${lecon.id}/rejeter`).send({ commentaire: "Deuxième refus impossible." }).expect(409);
    expect((await admin.get("/admin/revue").expect(200)).body).toEqual([]);
  });

  it("le prof voit le refus, son commentaire et une notification", async () => {
    const tableau = (await prof.get("/studio").expect(200)).body as TableauStudio;
    expect(tableau.lecons[0]).toMatchObject({ statut: "BROUILLON", dernierCommentaire: "Ajoute un exemple chiffré après l'énoncé." });
    expect(tableau.notificationsNonLues).toBe(1);
    expect(tableau.notifications[0]?.contenu).toContain("renvoyée en brouillon : Ajoute un exemple chiffré");

    lecon = (await prof.get(`/studio/lecons/${lecon.id}`).expect(200)).body;
    expect(lecon).toMatchObject({
      statut: "BROUILLON",
      modifiable: true,
      commentaires: [{ auteur: "Admin Démo", contenu: "Ajoute un exemple chiffré après l'énoncé." }],
    });

    await prof.post("/progression/notifications/lues").expect(204);
    expect(((await prof.get("/studio").expect(200)).body as TableauStudio).notificationsNonLues).toBe(0);
  });

  it("le prof corrige et resoumet, l'admin publie", async () => {
    const corrige = `${CONTENU}\n## Exemple\n\nAvec $AM = 2$, $AB = 6$ et $AC = 9$ : $AN = 3$.\n`;
    await prof.patch(`/studio/lecons/${lecon.id}`).send({ contenu: corrige }).expect(200);
    await prof.post(`/studio/lecons/${lecon.id}/soumettre`).expect(200);

    const version = await admin.post(`/admin/lecons/${lecon.id}/publier`).expect(200);
    expect(version.body).toMatchObject({ numero: 1, titre: "Le théorème de Thalès" });

    lecon = (await prof.get(`/studio/lecons/${lecon.id}`).expect(200)).body;
    expect(lecon).toMatchObject({ statut: "PUBLIE", version: 1, modificationsQuizEnCours: false });
    expect(lecon.quiz.map((q) => q.enonce)).toEqual(QUIZ.map((q) => q.enonce));
    const tableau = (await prof.get("/studio").expect(200)).body as TableauStudio;
    expect(tableau.notifications[0]?.contenu).toContain("« Le théorème de Thalès » est publiée");
  });

  it("l'élève lit la leçon avec l'attribution du professeur et peut faire le quiz", async () => {
    const publiee = await eleve.get(`/lecons/${lecon.slug}`).expect(200);
    expect(publiee.body).toMatchObject({ titre: "Le théorème de Thalès", auteur: "Pr Moussa Professeur Démo", aUnQuiz: true });
    expect(publiee.body.sections.map((s: { titre: string | null }) => s.titre)).toContain("Exemple");

    const quiz = await eleve.get(`/quiz/lecons/${lecon.slug}`).expect(200);
    expect(quiz.body.questions).toHaveLength(3);
    expect(JSON.stringify(quiz.body)).not.toMatch(/correct|reponsesAcceptees|Thalès"\]/);
  });

  it("les leçons de l'équipe ne portent pas d'attribution", async () => {
    const demo = await prisma.lecon.findFirstOrThrow({ where: { auteurId: null, versionPublieeId: { not: null } } });
    expect((await anonyme().get(`/lecons/${demo.slug}`).expect(200)).body.auteur).toBeNull();
  });

  it("compte les vues une fois par visiteur et par heure, et remonte les statistiques au prof", async () => {
    await anonyme().post(`/lecons/${lecon.slug}/vue`).set("User-Agent", "navigateur-a").expect(204);
    await anonyme().post(`/lecons/${lecon.slug}/vue`).set("User-Agent", "navigateur-a").expect(204);
    await anonyme().post(`/lecons/${lecon.slug}/vue`).set("User-Agent", "navigateur-b").expect(204);
    await anonyme().post("/lecons/lecon-inexistante/vue").expect(204);

    const tentative = await eleve.post(`/quiz/lecons/${lecon.slug}/tentatives`).expect(200);
    const questions = (await eleve.get(`/quiz/lecons/${lecon.slug}`)).body.questions as { id: string; type: string }[];
    for (const question of questions) {
      const reponse = question.type === "QCM" ? ["a"] : question.type === "VRAI_FAUX" ? true : "Thalès";
      await eleve.put(`/quiz/tentatives/${tentative.body.id}/reponses/${question.id}`).send({ reponse }).expect(204);
    }
    await eleve.post(`/quiz/tentatives/${tentative.body.id}/soumettre`).expect(200);

    const { statistiques } = (await prof.get("/studio").expect(200)).body as TableauStudio;
    expect(statistiques.lecons).toEqual([
      { slug: lecon.slug, titre: "Le théorème de Thalès", vues: 2, tentatives: 1, tauxReussite: 100, scoreMoyen: 100 },
    ]);
  });

  it("modifier la leçon publiée ne change pas la version en ligne avant validation", async () => {
    await prof
      .patch(`/studio/lecons/${lecon.id}`)
      .send({ titre: "Thalès (version 2)", quiz: [QUIZ[1]] })
      .expect(200);

    const enLigne = await eleve.get(`/lecons/${lecon.slug}`).expect(200);
    expect(enLigne.body.titre).toBe("Le théorème de Thalès");
    expect((await eleve.get(`/quiz/lecons/${lecon.slug}`).expect(200)).body.questions).toHaveLength(3);
  });

  it("un prof ne supprime que ses brouillons jamais publiés", async () => {
    await prof.delete(`/studio/lecons/${lecon.id}`).expect(409);

    const chapitreId = (await prisma.lecon.findUniqueOrThrow({ where: { id: lecon.id } })).chapitreId;
    const brouillon = (await prof.post("/studio/lecons").send({ chapitreId, titre: "Brouillon abandonné" }).expect(201)).body;
    await autreProf.delete(`/studio/lecons/${brouillon.id}`).expect(404);
    await prof.delete(`/studio/lecons/${brouillon.id}`).expect(204);
    await prof.get(`/studio/lecons/${brouillon.id}`).expect(404);
  });
});
