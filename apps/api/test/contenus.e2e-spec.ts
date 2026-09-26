import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LECON_DEMO, MOT_DE_PASSE_DEMO, seedAll } from "../prisma/seed";
import { connecter, creerApp, viderBase, viderLimiteurs } from "./helpers";

const prisma = new PrismaClient();
let app: INestApplication;
let admin: Awaited<ReturnType<typeof connecter>>;
let eleve: Awaited<ReturnType<typeof connecter>>;
const anonyme = () => request(app.getHttpServer());

const CONTENU = `Introduction à la loi d'Ohm.

## Énoncé

La tension est proportionnelle à l'intensité : $U = R \\times I$.

## Exemple

Avec $R = 10\\,\\Omega$ et $I = 0{,}5$ A, on obtient $U = 5$ V.
`;

// PNG 1×1 transparent.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

beforeAll(async () => {
  await viderBase(prisma);
  await seedAll(prisma);
  await viderLimiteurs();
  app = await creerApp();
  admin = await connecter(app, "admin.demo@xele.sn", MOT_DE_PASSE_DEMO);
  eleve = await connecter(app, "eleve.demo@xele.sn", MOT_DE_PASSE_DEMO);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("circuit de publication d'une leçon", () => {
  let chapitreId: string;
  let leconId: string;
  let slug: string;

  it("l'admin crée un chapitre et une leçon en brouillon", async () => {
    const chapitre = await admin
      .post("/admin/chapitres")
      .send({ niveau: "3e", matiere: "PC", titre: "Électricité" })
      .expect(201);
    chapitreId = chapitre.body.id;

    const lecon = await admin
      .post("/admin/lecons")
      .send({ chapitreId, titre: "La loi d'Ohm", contenu: CONTENU })
      .expect(201);
    leconId = lecon.body.id;
    slug = lecon.body.slug;

    expect(slug).toBe("la-loi-d-ohm");
    expect(lecon.body).toMatchObject({ statut: "BROUILLON", version: 0 });
  });

  it("une leçon en brouillon renvoie 404 aux élèves et aux visiteurs", async () => {
    await eleve.get(`/lecons/${slug}`).expect(404);
    await anonyme().get(`/lecons/${slug}`).expect(404);
    await anonyme().get(`/lecons/${slug}/pdf`).expect(404);
  });

  it("n'apparaît pas dans la navigation tant qu'elle n'est pas publiée", async () => {
    const page = await anonyme().get("/catalogue/3e/pc").expect(200);
    const slugs = (page.body.chapitres as { lecons: { slug: string }[] }[]).flatMap((c) => c.lecons.map((l) => l.slug));
    expect(slugs).not.toContain(slug);
  });

  it("refuse de publier directement un brouillon (409)", async () => {
    await admin.post(`/admin/lecons/${leconId}/publier`).expect(409);
  });

  it("soumise puis publiée, elle devient visible de tous, découpée en sections", async () => {
    await admin.post(`/admin/lecons/${leconId}/soumettre`).expect(200);
    const version = await admin.post(`/admin/lecons/${leconId}/publier`).expect(200);
    expect(version.body.numero).toBe(1);

    const publiee = await eleve.get(`/lecons/${slug}`).expect(200);
    expect(publiee.body).toMatchObject({
      titre: "La loi d'Ohm",
      niveau: "3e",
      matiere: { slug: "pc", nom: "Physique-Chimie" },
      chapitre: "Électricité",
      version: 1,
    });
    expect((publiee.body.sections as { titre: string | null }[]).map((s) => s.titre)).toEqual([
      null,
      "Énoncé",
      "Exemple",
    ]);
    expect(publiee.body.sections[1].html).toContain('class="katex"');
    expect(publiee.body.resume).toBe("Introduction à la loi d'Ohm.");

    const page = await anonyme().get("/catalogue/3e/pc").expect(200);
    expect(page.body.chapitres).toEqual(
      expect.arrayContaining([{ titre: "Électricité", lecons: [{ slug, titre: "La loi d'Ohm" }] }]),
    );
  });

  it("modifier la leçon publiée ne change pas ce que voient les élèves avant republication", async () => {
    await admin
      .patch(`/admin/lecons/${leconId}`)
      .send({ titre: "La loi d'Ohm (révisée)", contenu: "## Nouveau\nTexte révisé." })
      .expect(200);

    const enLigne = await eleve.get(`/lecons/${slug}`).expect(200);
    expect(enLigne.body).toMatchObject({ titre: "La loi d'Ohm", version: 1 });

    await admin.post(`/admin/lecons/${leconId}/soumettre`).expect(200);
    await admin.post(`/admin/lecons/${leconId}/publier`).expect(200);
    const republiee = await eleve.get(`/lecons/${slug}`).expect(200);
    expect(republiee.body).toMatchObject({ titre: "La loi d'Ohm (révisée)", version: 2 });
  });

  it("une version publiée est immuable, jusque dans la base de données", async () => {
    await expect(
      prisma.versionLecon.updateMany({ where: { leconId }, data: { titre: "Falsifié" } }),
    ).rejects.toThrow(/immuable/);
  });

  it("une leçon supprimée disparaît pour les élèves", async () => {
    await admin.delete(`/admin/lecons/${leconId}`).expect(204);
    await eleve.get(`/lecons/${slug}`).expect(404);
  });
});

describe("téléchargement du PDF d'une leçon publiée", () => {
  it("renvoie un PDF valide (content-type, taille > 0)", async () => {
    const reponse = await anonyme()
      .get(`/lecons/${LECON_DEMO.slug}/pdf`)
      .buffer(true)
      .parse((res, fin) => {
        const morceaux: Buffer[] = [];
        res.on("data", (morceau: Buffer) => morceaux.push(morceau));
        res.on("end", () => fin(null, Buffer.concat(morceaux)));
      })
      .expect(200);

    expect(reponse.headers["content-type"]).toBe("application/pdf");
    expect(reponse.headers["content-disposition"]).toBe(
      `attachment; filename="${LECON_DEMO.slug}-v1.pdf"`,
    );
    const pdf = reponse.body as Buffer;
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("médias", () => {
  it("l'admin téléverse une image, servie ensuite avec un cache permanent", async () => {
    const envoi = await admin.post("/admin/medias").attach("fichier", PNG, "schema.png").expect(201);
    expect(envoi.body.url).toMatch(/^\/api\/medias\/[a-f0-9]{64}\.png$/);

    const image = await anonyme().get(`/medias/${envoi.body.fichier}`).expect(200);
    expect(image.headers["content-type"]).toBe("image/png");
    expect(image.headers["cache-control"]).toContain("immutable");
  });

  it("refuse un SVG déguisé en PNG", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    await admin.post("/admin/medias").attach("fichier", svg, "piege.png").expect(400);
  });

  it("refuse le téléversement aux non-admins", async () => {
    await eleve.post("/admin/medias").attach("fichier", PNG, "schema.png").expect(403);
  });
});
