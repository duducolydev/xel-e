import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOT_DE_PASSE_DEMO, seedAll } from "../prisma/seed";
import { connecter, creerApp, viderBase, viderLimiteurs } from "./helpers";

// Doit rester identique à la matrice de DOCS/acces.md.
type Profil = "anonyme" | "ELEVE" | "PROFESSEUR" | "PARENT" | "ADMIN";

const COMPTES: Record<Exclude<Profil, "anonyme">, string> = {
  ELEVE: "eleve.demo@xele.sn",
  PROFESSEUR: "prof.demo@xele.sn",
  PARENT: "parent.demo@xele.sn",
  ADMIN: "admin.demo@xele.sn",
};

interface Ligne {
  methode: "get" | "post";
  chemin: string;
  attendu: Record<Profil, number>;
}

const MATRICE: Ligne[] = [
  {
    methode: "get",
    chemin: "/health",
    attendu: { anonyme: 200, ELEVE: 200, PROFESSEUR: 200, PARENT: 200, ADMIN: 200 },
  },
  {
    methode: "get",
    chemin: "/auth/moi",
    attendu: { anonyme: 401, ELEVE: 200, PROFESSEUR: 200, PARENT: 200, ADMIN: 200 },
  },
  {
    methode: "get",
    chemin: "/admin/professeurs/en-attente",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 200 },
  },
  {
    methode: "post",
    chemin: `/admin/professeurs/${randomUUID()}/valider`,
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 404 },
  },
];

const prisma = new PrismaClient();
let app: INestApplication;
const clients = {} as Record<Profil, ReturnType<typeof request.agent>>;

beforeAll(async () => {
  await viderBase(prisma);
  await seedAll(prisma);
  await viderLimiteurs();
  app = await creerApp();
  clients.anonyme = request.agent(app.getHttpServer());
  for (const [role, email] of Object.entries(COMPTES)) {
    clients[role as Profil] = await connecter(app, email, MOT_DE_PASSE_DEMO);
  }
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("matrice d'accès rôle × ressource", () => {
  for (const ligne of MATRICE) {
    for (const [profil, statut] of Object.entries(ligne.attendu)) {
      it(`${ligne.methode.toUpperCase()} ${ligne.chemin} — ${profil} ⇒ ${statut}`, async () => {
        const reponse = await clients[profil as Profil][ligne.methode](ligne.chemin);
        expect(reponse.status).toBe(statut);
      });
    }
  }
});
