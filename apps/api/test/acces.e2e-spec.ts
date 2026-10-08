import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LECON_DEMO, MOT_DE_PASSE_DEMO, seedAll } from "../prisma/seed";
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
  {
    methode: "get",
    chemin: "/catalogue",
    attendu: { anonyme: 200, ELEVE: 200, PROFESSEUR: 200, PARENT: 200, ADMIN: 200 },
  },
  {
    methode: "get",
    chemin: "/catalogue/4e/maths",
    attendu: { anonyme: 200, ELEVE: 200, PROFESSEUR: 200, PARENT: 200, ADMIN: 200 },
  },
  {
    methode: "get",
    chemin: `/lecons/${LECON_DEMO.slug}`,
    attendu: { anonyme: 200, ELEVE: 200, PROFESSEUR: 200, PARENT: 200, ADMIN: 200 },
  },
  {
    methode: "get",
    chemin: `/quiz/lecons/${LECON_DEMO.slug}`,
    attendu: { anonyme: 401, ELEVE: 200, PROFESSEUR: 200, PARENT: 200, ADMIN: 200 },
  },
  {
    methode: "get",
    chemin: "/quiz/tentatives",
    attendu: { anonyme: 401, ELEVE: 200, PROFESSEUR: 200, PARENT: 200, ADMIN: 200 },
  },
  {
    methode: "get",
    chemin: `/quiz/tentatives/${randomUUID()}`,
    attendu: { anonyme: 401, ELEVE: 404, PROFESSEUR: 404, PARENT: 404, ADMIN: 404 },
  },
  {
    methode: "get",
    chemin: "/progression/tableau-de-bord",
    attendu: { anonyme: 401, ELEVE: 200, PROFESSEUR: 200, PARENT: 200, ADMIN: 200 },
  },
  {
    methode: "get",
    chemin: "/progression/classement",
    attendu: { anonyme: 401, ELEVE: 200, PROFESSEUR: 200, PARENT: 200, ADMIN: 200 },
  },
  {
    methode: "post",
    chemin: `/progression/lecons/${LECON_DEMO.slug}/terminer`,
    attendu: { anonyme: 401, ELEVE: 200, PROFESSEUR: 200, PARENT: 200, ADMIN: 200 },
  },
  {
    methode: "get",
    chemin: "/admin/chapitres?niveau=4e&matiere=Maths",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 200 },
  },
  {
    methode: "post",
    chemin: "/admin/lecons",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 400 },
  },
  {
    methode: "post",
    chemin: `/admin/lecons/${randomUUID()}/publier`,
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 404 },
  },
  {
    methode: "post",
    chemin: "/admin/medias",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 400 },
  },
  {
    methode: "post",
    chemin: `/admin/lecons/${randomUUID()}/rejeter`,
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 400 },
  },
  {
    methode: "get",
    chemin: "/admin/revue",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 200 },
  },
  {
    methode: "get",
    chemin: "/studio",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 200, PARENT: 403, ADMIN: 200 },
  },
  {
    methode: "get",
    chemin: "/studio/chapitres",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 200, PARENT: 403, ADMIN: 200 },
  },
  {
    methode: "post",
    chemin: "/studio/lecons",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 400, PARENT: 403, ADMIN: 400 },
  },
  {
    methode: "get",
    chemin: `/studio/lecons/${randomUUID()}`,
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 404, PARENT: 403, ADMIN: 404 },
  },
  {
    methode: "post",
    chemin: "/studio/medias",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 400, PARENT: 403, ADMIN: 400 },
  },
  {
    methode: "get",
    chemin: "/forum/etat",
    attendu: { anonyme: 401, ELEVE: 200, PROFESSEUR: 200, PARENT: 403, ADMIN: 200 },
  },
  {
    methode: "get",
    chemin: "/forum/niveaux/3e/maths",
    attendu: { anonyme: 401, ELEVE: 200, PROFESSEUR: 200, PARENT: 403, ADMIN: 200 },
  },
  {
    methode: "post",
    chemin: "/forum/sujets",
    attendu: { anonyme: 401, ELEVE: 400, PROFESSEUR: 400, PARENT: 403, ADMIN: 400 },
  },
  {
    methode: "get",
    chemin: `/forum/sujets/${randomUUID()}`,
    attendu: { anonyme: 401, ELEVE: 404, PROFESSEUR: 404, PARENT: 403, ADMIN: 404 },
  },
  {
    methode: "post",
    chemin: "/forum/pieces-jointes",
    attendu: { anonyme: 401, ELEVE: 400, PROFESSEUR: 400, PARENT: 403, ADMIN: 400 },
  },
  {
    methode: "get",
    chemin: "/admin/moderation",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 200 },
  },
  {
    methode: "post",
    chemin: "/admin/moderation/termes",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 400 },
  },
  {
    methode: "post",
    chemin: `/admin/moderation/messages/${randomUUID()}/restaurer`,
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 404 },
  },
  {
    methode: "post",
    chemin: "/parents/code",
    attendu: { anonyme: 401, ELEVE: 201, PROFESSEUR: 403, PARENT: 403, ADMIN: 403 },
  },
  {
    methode: "post",
    chemin: "/activite/presence",
    attendu: { anonyme: 401, ELEVE: 204, PROFESSEUR: 403, PARENT: 403, ADMIN: 403 },
  },
  {
    methode: "get",
    chemin: "/parents",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 200, ADMIN: 403 },
  },
  {
    methode: "post",
    chemin: "/parents/liaison",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 400, ADMIN: 403 },
  },
  {
    methode: "get",
    chemin: `/parents/enfants/${randomUUID()}`,
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 403 },
  },
  {
    methode: "post",
    chemin: "/parents/desinscription",
    attendu: { anonyme: 400, ELEVE: 400, PROFESSEUR: 400, PARENT: 400, ADMIN: 400 },
  },
  {
    methode: "post",
    chemin: "/admin/resumes/declencher",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 400 },
  },
  {
    methode: "post",
    chemin: `/admin/eleves/${randomUUID()}/code-liaison`,
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 404 },
  },
  {
    methode: "get",
    chemin: "/bfem/examens",
    attendu: { anonyme: 401, ELEVE: 200, PROFESSEUR: 403, PARENT: 403, ADMIN: 200 },
  },
  {
    methode: "post",
    chemin: "/bfem/examens/bfem-maths-examen-blanc-2/copies",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 200 },
  },
  {
    methode: "get",
    chemin: `/bfem/copies/${randomUUID()}`,
    attendu: { anonyme: 401, ELEVE: 404, PROFESSEUR: 403, PARENT: 403, ADMIN: 404 },
  },
  {
    methode: "get",
    chemin: "/bfem/annales",
    attendu: { anonyme: 401, ELEVE: 200, PROFESSEUR: 403, PARENT: 403, ADMIN: 200 },
  },
  {
    methode: "get",
    chemin: "/bfem/simulation",
    attendu: { anonyme: 401, ELEVE: 200, PROFESSEUR: 403, PARENT: 403, ADMIN: 200 },
  },
  {
    methode: "post",
    chemin: "/admin/bfem/examens",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 400 },
  },
  {
    methode: "post",
    chemin: "/admin/abonnements",
    attendu: { anonyme: 401, ELEVE: 403, PROFESSEUR: 403, PARENT: 403, ADMIN: 400 },
  },
  {
    methode: "post",
    chemin: `/lecons/${LECON_DEMO.slug}/vue`,
    attendu: { anonyme: 204, ELEVE: 204, PROFESSEUR: 204, PARENT: 204, ADMIN: 204 },
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
