import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { Tentative } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { QuizService } from "./quiz.service";

const QUESTIONS = [
  {
    id: "q1",
    quizId: "quiz-1",
    type: "QCM" as const,
    enonce: "Quel côté est l'hypoténuse ?",
    choix: [
      { id: "a", texte: "[AB]" },
      { id: "b", texte: "[BC]" },
    ],
    reponseCorrecte: ["b"],
    bareme: 2,
    explication: "Opposé à l'angle droit.",
    ordre: 1,
  },
  {
    id: "q2",
    quizId: "quiz-1",
    type: "VRAI_FAUX" as const,
    enonce: "BC² = AB² + AC²",
    choix: null,
    reponseCorrecte: true,
    bareme: 1,
    explication: null,
    ordre: 2,
  },
  {
    id: "q3",
    quizId: "quiz-1",
    type: "REPONSE_COURTE" as const,
    enonce: "BC si AB = 3 et AC = 4 ?",
    choix: null,
    reponseCorrecte: ["5", "5 cm"],
    bareme: 1,
    explication: null,
    ordre: 3,
  },
];

const LECON = {
  slug: "pythagore",
  versionPubliee: { titre: "Le théorème de Pythagore" },
  chapitre: { niveau: { libelle: "4e" }, matiere: { libelle: "Maths" } },
};

function creerFausseBase() {
  const tentatives: Tentative[] = [];
  const quiz = { id: "quiz-1", lecon: LECON, questions: QUESTIONS };
  const correspond = (t: Tentative, where: Record<string, unknown>) =>
    Object.entries(where).every(([cle, valeur]) => {
      if (cle === "reponses") return JSON.stringify(t.reponses) === JSON.stringify((valeur as { equals: unknown }).equals);
      return t[cle as keyof Tentative] === valeur;
    });

  const prisma = {
    quiz: {
      findFirst: async () => quiz,
      findUniqueOrThrow: async () => quiz,
    },
    question: { findMany: async () => QUESTIONS, count: async () => QUESTIONS.length },
    tentative: {
      findUnique: async ({ where }: { where: { id?: string; enCoursCle?: string } }) =>
        tentatives.find((t) => (where.id ? t.id === where.id : t.enCoursCle === where.enCoursCle)) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { enCoursCle: string } }) =>
        tentatives.find((t) => t.enCoursCle === where.enCoursCle)!,
      create: async ({ data }: { data: Partial<Tentative> }) => {
        const tentative = {
          id: `t-${tentatives.length + 1}`,
          position: 0,
          score: null,
          pointsObtenus: null,
          pointsTotal: null,
          correction: null,
          termineLe: null,
          demarreLe: new Date(),
          ...data,
        } as Tentative;
        tentatives.push(tentative);
        return tentative;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Tentative> }) => {
        const cibles = tentatives.filter((t) => correspond(t, where));
        cibles.forEach((t) => Object.assign(t, data));
        return { count: cibles.length };
      },
      findMany: async () => tentatives.map((t) => ({ ...t, quiz })),
    },
  } as unknown as PrismaService;
  return { prisma, tentatives };
}

describe("QuizService", () => {
  let service: QuizService;
  let tentatives: Tentative[];

  beforeEach(() => {
    const base = creerFausseBase();
    service = new QuizService(base.prisma);
    tentatives = base.tentatives;
  });

  it("le quiz public ne contient pas les réponses", async () => {
    const quiz = await service.quizPublic("pythagore");

    expect(quiz.pointsTotal).toBe(4);
    expect(JSON.stringify(quiz)).not.toMatch(/reponseCorrecte|explication|Opposé/);
  });

  describe("reprise de tentative", () => {
    it("les réponses déjà enregistrées sont conservées", async () => {
      const tentative = await service.demarrer("pythagore", "eleve-1");
      await service.enregistrerReponse(tentative.id, "q1", ["b"], "eleve-1");
      await service.enregistrerReponse(tentative.id, "q2", false, "eleve-1");

      const reprise = await service.demarrer("pythagore", "eleve-1");

      expect(reprise.id).toBe(tentative.id);
      expect(reprise.reponses).toEqual({ q1: ["b"], q2: false });
      expect(reprise.position).toBe(1);
      expect(tentatives).toHaveLength(1);
    });

    it("modifier une réponse remplace l'ancienne sans toucher aux autres", async () => {
      const tentative = await service.demarrer("pythagore", "eleve-1");
      await service.enregistrerReponse(tentative.id, "q1", ["a"], "eleve-1");
      await service.enregistrerReponse(tentative.id, "q3", "5", "eleve-1");
      await service.enregistrerReponse(tentative.id, "q1", ["b"], "eleve-1");

      expect((await service.tentativeEnCours("pythagore", "eleve-1"))?.reponses).toEqual({ q1: ["b"], q3: "5" });
    });

    it("reprend à la question affichée, même sans réponse", async () => {
      const tentative = await service.demarrer("pythagore", "eleve-1");
      await service.enregistrerReponse(tentative.id, "q1", ["b"], "eleve-1");
      await service.definirPosition(tentative.id, 2, "eleve-1");

      expect((await service.demarrer("pythagore", "eleve-1")).position).toBe(2);
    });

    it("refuse une position hors du quiz", async () => {
      const tentative = await service.demarrer("pythagore", "eleve-1");

      await expect(service.definirPosition(tentative.id, 3, "eleve-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("chaque élève a sa propre tentative", async () => {
      const a = await service.demarrer("pythagore", "eleve-1");
      const b = await service.demarrer("pythagore", "eleve-2");

      expect(a.id).not.toBe(b.id);
    });
  });

  describe("validation des réponses", () => {
    it.each([
      ["texte pour un QCM", "q1", "b"],
      ["choix inconnu", "q1", ["z"]],
      ["deux choix pour un QCM simple", "q1", ["a", "b"]],
      ["texte pour un vrai/faux", "q2", "vrai"],
      ["liste pour une réponse courte", "q3", ["5"]],
    ])("refuse : %s", async (_cas, questionId, reponse) => {
      const tentative = await service.demarrer("pythagore", "eleve-1");

      await expect(
        service.enregistrerReponse(tentative.id, questionId, reponse as never, "eleve-1"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse une question d'un autre quiz", async () => {
      const tentative = await service.demarrer("pythagore", "eleve-1");

      await expect(service.enregistrerReponse(tentative.id, "q-inconnue", true, "eleve-1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("accepte null pour effacer une réponse", async () => {
      const tentative = await service.demarrer("pythagore", "eleve-1");

      await expect(service.enregistrerReponse(tentative.id, "q1", null, "eleve-1")).resolves.toBeUndefined();
    });
  });

  describe("soumission", () => {
    it("corrige côté serveur et fige le résultat", async () => {
      const tentative = await service.demarrer("pythagore", "eleve-1");
      await service.enregistrerReponse(tentative.id, "q1", ["b"], "eleve-1");
      await service.enregistrerReponse(tentative.id, "q3", "5 cm", "eleve-1");

      const resultat = await service.soumettre(tentative.id, "eleve-1");

      expect(resultat).toMatchObject({ score: 75, pointsObtenus: 3, pointsTotal: 4 });
      expect(resultat.details.map((d) => d.statut)).toEqual(["correcte", "sans-reponse", "correcte"]);
      expect(tentatives[0]).toMatchObject({ enCoursCle: null, score: 75 });
      expect(tentatives[0]?.termineLe).toBeInstanceOf(Date);
    });

    it("refuse toute réponse ou seconde soumission après la soumission", async () => {
      const tentative = await service.demarrer("pythagore", "eleve-1");
      await service.soumettre(tentative.id, "eleve-1");

      await expect(service.enregistrerReponse(tentative.id, "q1", ["a"], "eleve-1")).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.soumettre(tentative.id, "eleve-1")).rejects.toBeInstanceOf(ConflictException);
    });

    it("permet de refaire le quiz avec une nouvelle tentative vierge", async () => {
      const premiere = await service.demarrer("pythagore", "eleve-1");
      await service.enregistrerReponse(premiere.id, "q1", ["b"], "eleve-1");
      await service.soumettre(premiere.id, "eleve-1");

      const seconde = await service.demarrer("pythagore", "eleve-1");

      expect(seconde.id).not.toBe(premiere.id);
      expect(seconde.reponses).toEqual({});
    });

    it("relit le résultat figé, et le range dans l'historique", async () => {
      const tentative = await service.demarrer("pythagore", "eleve-1");
      await service.soumettre(tentative.id, "eleve-1");

      const resultat = await service.resultat(tentative.id, "eleve-1");
      const historique = await service.historique("eleve-1");

      expect(resultat.score).toBe(0);
      expect(historique).toEqual([
        expect.objectContaining({ id: tentative.id, score: 0, lecon: expect.objectContaining({ slug: "pythagore" }) }),
      ]);
    });
  });

  describe("cloisonnement entre élèves", () => {
    it("un élève ne peut ni lire, ni remplir, ni soumettre la tentative d'un autre (404)", async () => {
      const tentative = await service.demarrer("pythagore", "eleve-1");

      await expect(service.enregistrerReponse(tentative.id, "q1", ["a"], "eleve-2")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.soumettre(tentative.id, "eleve-2")).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.resultat(tentative.id, "eleve-2")).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
