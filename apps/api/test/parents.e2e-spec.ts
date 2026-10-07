import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import type { CodeLiaisonGenere, EnfantLie, TableauEnfant } from "@xel-e/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOT_DE_PASSE_DEMO, seedAll } from "../prisma/seed";
import { hasherMotDePasse } from "../src/auth/password";
import { CanalMock } from "../src/parents/canaux";
import { FileResumes } from "../src/parents/file-resumes";
import type { EspaceParent } from "../src/parents/parents.controller";
import { attendreMail, connecter, creerApp, viderBase, viderLimiteurs, viderMailhog } from "./helpers";

const prisma = new PrismaClient();
let app: INestApplication;
type Agent = Awaited<ReturnType<typeof connecter>>;
let eleve: Agent; // fatou_demo, 3e
let parent: Agent;
let autreParent: Agent;
let admin: Agent;
let eleveId: string;
const anonyme = () => request(app.getHttpServer());
const EMAIL_PARENT = "mame.diop@example.sn";

async function inscrireParent(email: string): Promise<Agent> {
  await anonyme().post("/auth/inscription/parent").send({ nomComplet: "Mame Diop", email, motDePasse: "motdepasse1" }).expect(201);
  return connecter(app, email, "motdepasse1");
}

async function attendreFile(): Promise<void> {
  await app.get(FileResumes).attendreFin(20_000);
}

beforeAll(async () => {
  await viderBase(prisma);
  await seedAll(prisma);
  await viderLimiteurs();
  await viderMailhog();
  app = await creerApp();
  eleve = await connecter(app, "eleve.demo@xele.sn", MOT_DE_PASSE_DEMO);
  admin = await connecter(app, "admin.demo@xele.sn", MOT_DE_PASSE_DEMO);
  eleveId = (await prisma.user.findUniqueOrThrow({ where: { email: "eleve.demo@xele.sn" } })).id;
  parent = await inscrireParent(EMAIL_PARENT);
  autreParent = await inscrireParent("autre.parent@example.sn");
}, 60_000);

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("liaison parent-enfant par code", () => {
  let code: string;

  it("l'élève génère un code de liaison valable 48 h", async () => {
    const genere = (await eleve.post("/parents/code").expect(201)).body as CodeLiaisonGenere;
    code = genere.code;

    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(new Date(genere.expireLe).getTime() - Date.now()).toBeGreaterThan(47.9 * 3600_000);
  });

  it("un code régénéré remplace le précédent", async () => {
    const ancien = code;
    code = ((await eleve.post("/parents/code").expect(201)).body as CodeLiaisonGenere).code;

    await parent.post("/parents/liaison").send({ code: ancien }).expect(400);
  });

  it("le parent saisit le code (casse et espaces tolérés) et voit son enfant", async () => {
    const enfant = (await parent.post("/parents/liaison").send({ code: ` ${code.toLowerCase().replace("-", " ")} ` }).expect(201)).body as EnfantLie;
    expect(enfant).toEqual({ id: eleveId, nomComplet: "Fatou Élève Démo", niveau: "3e" });

    const espace = (await parent.get("/parents").expect(200)).body as EspaceParent;
    expect(espace.enfants).toEqual([enfant]);
    expect(espace.preferences).toMatchObject({ frequence: "HEBDOMADAIRE", email: true });
    expect((await eleve.get("/parents/mes-parents").expect(200)).body).toEqual({ nombre: 1 });
  });

  it("le code ne sert qu'une fois", async () => {
    const reponse = await autreParent.post("/parents/liaison").send({ code }).expect(400);
    expect(reponse.body.message).toMatch(/invalide ou a expiré/);
  });

  it("un code expiré est refusé", async () => {
    const nouveau = ((await eleve.post("/parents/code").expect(201)).body as CodeLiaisonGenere).code;
    await prisma.codeLiaison.updateMany({ where: { eleveId, utiliseLe: null }, data: { expireLe: new Date(Date.now() - 1000) } });

    await autreParent.post("/parents/liaison").send({ code: nouveau }).expect(400);
  });

  it("un parent non lié ne voit pas les données de l'enfant (403)", async () => {
    await autreParent.get(`/parents/enfants/${eleveId}`).expect(403);
    await autreParent.post(`/parents/enfants/${eleveId}/accord-parental`).expect(403);
  });

  it("les rôles sont cloisonnés", async () => {
    await eleve.get("/parents").expect(403);
    await parent.post("/parents/code").expect(403);
    await parent.post("/activite/presence").expect(403);
    await anonyme().get("/parents").expect(401);
  });
});

describe("tableau de bord parent", () => {
  it("compte le temps d'activité : une minute par signal, une seule fois par minute", async () => {
    await eleve.post("/activite/presence").expect(204);
    await eleve.post("/activite/presence").expect(204);

    const tableau = (await parent.get(`/parents/enfants/${eleveId}`).expect(200)).body as TableauEnfant;
    expect(tableau.activite).toHaveLength(7);
    expect(tableau.activite.at(-1)!.minutes).toBe(1);
    expect(tableau.minutesSemaine).toBe(1);
  });

  it("reflète leçons terminées, scores, série et XP de l'enfant", async () => {
    const lecon = await prisma.lecon.findFirstOrThrow({ where: { versionPublieeId: { not: null } }, orderBy: { slug: "asc" } });
    await eleve.post(`/progression/lecons/${lecon.slug}/terminer`).expect(200);

    const tableau = (await parent.get(`/parents/enfants/${eleveId}`).expect(200)).body as TableauEnfant;
    expect(tableau).toMatchObject({
      enfant: { id: eleveId, niveau: "3e" },
      leconsTerminees: { total: 1, semaine: 1, dernieres: [{ titre: lecon.titre }] },
      serie: { actuelle: 1 },
      xpSemaine: 10,
      accordParental: { requis: false },
    });
  });

  it("multi-enfants : un second enfant de moins de 15 ans, et l'accord parental donné depuis l'espace parent", async () => {
    const niveau = await prisma.niveau.findUniqueOrThrow({ where: { libelle: "6e" } });
    const cadet = await prisma.user.create({
      data: {
        identifiant: "ali.diop",
        role: "ELEVE",
        nomComplet: "Ali Diop",
        motDePasseHash: await hasherMotDePasse("motdepasse1"),
        niveauId: niveau.id,
        naissanceMois: 5,
        naissanceAnnee: 2015,
      },
    });
    const agentCadet = await connecter(app, "ali.diop", "motdepasse1");
    const { code } = (await agentCadet.post("/parents/code").expect(201)).body as CodeLiaisonGenere;
    await parent.post("/parents/liaison").send({ code }).expect(201);

    expect(((await parent.get("/parents").expect(200)).body as EspaceParent).enfants.map((e) => e.nomComplet)).toEqual([
      "Fatou Élève Démo",
      "Ali Diop",
    ]);
    const avant = (await parent.get(`/parents/enfants/${cadet.id}`).expect(200)).body as TableauEnfant;
    expect(avant.accordParental).toEqual({ requis: true, donne: false });
    expect((await agentCadet.get("/forum/etat").expect(200)).body.acces).toBe(false);

    await parent.post(`/parents/enfants/${cadet.id}/accord-parental`).expect(204);

    expect((await agentCadet.get("/forum/etat").expect(200)).body.acces).toBe(true);
  });

  it("l'admin peut générer un code pour un élève", async () => {
    const genere = await admin.post(`/admin/eleves/${eleveId}/code-liaison`).expect(201);
    expect(genere.body.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
});

describe("résumé hebdomadaire et préférences", () => {
  it("valide les préférences : un numéro est requis pour WhatsApp ou SMS", async () => {
    const reponse = await parent
      .put("/parents/preferences")
      .send({ frequence: "HEBDOMADAIRE", email: true, whatsapp: true, sms: false })
      .expect(400);
    expect(reponse.body.erreurs.telephone).toMatch(/numéro de téléphone/);

    await parent
      .put("/parents/preferences")
      .send({ frequence: "HEBDOMADAIRE", email: true, whatsapp: true, sms: true, telephone: "+221 77 123 45 67" })
      .expect(200);
  });

  it("déclenchement manuel du job hebdo : notification in-app, email dans mailhog, WhatsApp et SMS au mock", async () => {
    await admin.post("/admin/resumes/declencher").send({ type: "HEBDOMADAIRE" }).expect(202);
    await attendreFile();

    const espace = (await parent.get("/parents").expect(200)).body as EspaceParent;
    expect(espace.notifications[0]?.contenu).toMatch(/^Xel-E, semaine du .* — Fatou : 1 min, 1 leçon ; Ali : pas d'activité\.$/);

    const mail = await attendreMail(EMAIL_PARENT, "le résumé Xel-E");
    expect(mail.corps).toContain("Bonjour Mame Diop,");
    expect(mail.corps).toContain("Fatou a travaillé 1 min, sur 1 jour.");
    expect(mail.corps).toContain("Ali n'a pas travaillé sur Xel-E cette semaine.");
    expect(mail.corps).toMatch(/\/desinscription\?token=/);

    const envoyes = app.get(CanalMock).envoyes.filter((m) => m.destinataire === "+221771234567");
    expect(envoyes.map((m) => m.canal).sort()).toEqual(["SMS", "WHATSAPP"]);
    expect(envoyes[0]!.message).toBe(espace.notifications[0]!.contenu);
  });

  it("redéclencher la même semaine n'envoie rien en double", async () => {
    const avant = await prisma.resumeEnvoye.count();
    await admin.post("/admin/resumes/declencher").send({ type: "HEBDOMADAIRE" }).expect(202);
    await attendreFile();

    expect(await prisma.resumeEnvoye.count()).toBe(avant);
    expect(await prisma.notification.count({ where: { utilisateur: { email: EMAIL_PARENT }, type: "RESUME" } })).toBe(1);
  });

  it("un canal en échec est retenté avec backoff jusqu'à réussir, une seule fois", async () => {
    await autreParent
      .put("/parents/preferences")
      .send({ frequence: "MENSUELLE", email: false, whatsapp: false, sms: true, telephone: "+221 78 000 00 01" })
      .expect(200);
    const { code } = (await eleve.post("/parents/code").expect(201)).body as CodeLiaisonGenere;
    await autreParent.post("/parents/liaison").send({ code }).expect(201);
    const mock = app.get(CanalMock);
    mock.programmerEchecs(2);

    await admin.post("/admin/resumes/declencher").send({ type: "MENSUELLE" }).expect(202);
    await attendreFile();

    expect(mock.echecsEnAttente).toBe(0);
    expect(mock.envoyes.filter((m) => m.destinataire === "+221780000001")).toHaveLength(1);
    const parentId = (await prisma.user.findUniqueOrThrow({ where: { email: "autre.parent@example.sn" } })).id;
    expect(await prisma.resumeEnvoye.findMany({ where: { parentId }, select: { canal: true } })).toEqual(
      expect.arrayContaining([{ canal: "SMS" }, { canal: "IN_APP" }]),
    );
    // Le parent hebdomadaire n'a pas reçu de résumé mensuel.
    expect(await prisma.resumeEnvoye.count({ where: { parent: { email: EMAIL_PARENT }, periode: { not: { contains: "-S" } } } })).toBe(0);
  });

  it("le lien de désinscription de l'email arrête les résumés, sans connexion", async () => {
    const mail = await attendreMail(EMAIL_PARENT, "le résumé Xel-E");
    const token = decodeURIComponent(/token=([^\s]+)/.exec(mail.corps)![1]!);

    await anonyme().post("/parents/desinscription").send({ token: `${token}x` }).expect(400);
    await anonyme().post("/parents/desinscription").send({ token }).expect(204);

    expect(((await parent.get("/parents").expect(200)).body as EspaceParent).preferences.frequence).toBe("AUCUNE");
  });
});
