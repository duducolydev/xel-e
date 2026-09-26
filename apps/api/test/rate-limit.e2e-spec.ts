import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOT_DE_PASSE_DEMO, seedAll } from "../prisma/seed";
import { creerApp, viderBase, viderLimiteurs } from "./helpers";

const prisma = new PrismaClient();
let app: INestApplication;

beforeAll(async () => {
  await viderBase(prisma);
  await seedAll(prisma);
  await viderLimiteurs();
  app = await creerApp();
});

afterAll(async () => {
  await viderLimiteurs();
  await app.close();
  await prisma.$disconnect();
});

describe("limitation des tentatives de connexion", () => {
  it("6 tentatives de connexion échouées ⇒ 429", async () => {
    const tenter = (motDePasse: string) =>
      request(app.getHttpServer())
        .post("/auth/connexion")
        .send({ login: "eleve.demo@xele.sn", motDePasse });

    for (let i = 1; i <= 5; i += 1) {
      await tenter(`mauvais${i}`).expect(401);
    }

    const sixieme = await tenter("mauvais6").expect(429);
    expect(sixieme.body.message).toBe("Trop de tentatives. Réessaie dans quelques minutes.");

    // Même le bon mot de passe est refusé pendant le blocage.
    await tenter(MOT_DE_PASSE_DEMO).expect(429);
  });

  it("ne bloque pas les autres comptes", async () => {
    await request(app.getHttpServer())
      .post("/auth/connexion")
      .send({ login: "prof.demo@xele.sn", motDePasse: MOT_DE_PASSE_DEMO })
      .expect(200);
  });
});
