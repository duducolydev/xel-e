import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Tentative } from "@prisma/client";
import {
  INFOS_MATIERES,
  type ChoixPublic,
  type EtatTentative,
  type Matiere,
  type Niveau,
  type QuizPublic,
  type Reponse,
  type ResultatTentative,
  type ResumeTentative,
  type TypeQuestionQuiz,
} from "@xel-e/shared";
import { FILTRE_LECONS_PUBLIQUES } from "../contenus/workflow";
import { PrismaService } from "../prisma/prisma.service";
import { corrigerTentative, type QuestionCorrigible } from "./correction";
import { versQuestionPublique } from "./quiz-public";

const QUIZ_INTROUVABLE = "Aucun quiz disponible pour cette leçon.";
const TENTATIVE_INTROUVABLE = "Tentative introuvable.";
const TENTATIVE_TERMINEE = "Ce quiz a déjà été soumis. Lance une nouvelle tentative pour le refaire.";
const ESSAIS_ENREGISTREMENT = 5;

type LeconQuiz = QuizPublic["lecon"];

const INCLUSION_LECON = {
  lecon: {
    select: {
      slug: true,
      versionPubliee: { select: { titre: true } },
      chapitre: { select: { niveau: { select: { libelle: true } }, matiere: { select: { libelle: true } } } },
    },
  },
} as const;

interface LeconBrute {
  slug: string;
  versionPubliee: { titre: string } | null;
  chapitre: { niveau: { libelle: string }; matiere: { libelle: string } };
}

function versLeconQuiz(lecon: LeconBrute): LeconQuiz {
  return {
    slug: lecon.slug,
    titre: lecon.versionPubliee?.titre ?? "",
    niveau: lecon.chapitre.niveau.libelle as Niveau,
    matiere: INFOS_MATIERES[lecon.chapitre.matiere.libelle as Matiere].slug,
  };
}

function versQuestionCorrigible(question: {
  id: string;
  type: TypeQuestionQuiz;
  enonce: string;
  choix: Prisma.JsonValue;
  reponseCorrecte: Prisma.JsonValue;
  bareme: number;
  explication: string | null;
}): QuestionCorrigible {
  return { ...question, choix: (question.choix as ChoixPublic[] | null) ?? null };
}

function versEtat(tentative: Tentative): EtatTentative {
  return {
    id: tentative.id,
    quizId: tentative.quizId,
    position: tentative.position,
    reponses: (tentative.reponses as Record<string, Reponse> | null) ?? {},
    demarreLe: tentative.demarreLe.toISOString(),
  };
}

function cleEnCours(utilisateurId: string, quizId: string): string {
  return `${utilisateurId}:${quizId}`;
}

// Refuse une réponse dont la forme ne correspond pas au type de question (ex. texte pour un QCM).
function verifierForme(question: QuestionCorrigible, reponse: Reponse): void {
  if (reponse === null) return;
  const invalide = (message: string) => new BadRequestException(message);
  if (question.type === "QCM") {
    if (!Array.isArray(reponse)) throw invalide("Réponse attendue : une liste de choix.");
    const valides = new Set((question.choix ?? []).map((c) => c.id));
    if (reponse.some((id) => !valides.has(id))) throw invalide("Choix inconnu pour cette question.");
    const multiple = Array.isArray(question.reponseCorrecte) && question.reponseCorrecte.length > 1;
    if (!multiple && reponse.length > 1) throw invalide("Une seule réponse est possible pour cette question.");
  } else if (question.type === "VRAI_FAUX") {
    if (typeof reponse !== "boolean") throw invalide("Réponse attendue : vrai ou faux.");
  } else if (typeof reponse !== "string") {
    throw invalide("Réponse attendue : un texte.");
  }
}

@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService) {}

  private async quizDeLecon(slug: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { deletedAt: null, lecon: { slug, ...FILTRE_LECONS_PUBLIQUES } },
      include: { ...INCLUSION_LECON, questions: { orderBy: { ordre: "asc" } } },
    });
    if (!quiz || quiz.questions.length === 0) throw new NotFoundException(QUIZ_INTROUVABLE);
    return { ...quiz, questions: quiz.questions.map(versQuestionCorrigible) };
  }

  async quizPublic(slug: string): Promise<QuizPublic> {
    const quiz = await this.quizDeLecon(slug);
    return {
      id: quiz.id,
      lecon: versLeconQuiz(quiz.lecon),
      pointsTotal: quiz.questions.reduce((total, q) => total + q.bareme, 0),
      questions: quiz.questions.map(versQuestionPublique),
    };
  }

  async tentativeEnCours(slug: string, utilisateurId: string): Promise<EtatTentative | null> {
    const quiz = await this.quizDeLecon(slug);
    const tentative = await this.prisma.tentative.findUnique({
      where: { enCoursCle: cleEnCours(utilisateurId, quiz.id) },
    });
    return tentative ? versEtat(tentative) : null;
  }

  // Démarre une tentative, ou reprend celle en cours avec les réponses déjà enregistrées.
  async demarrer(slug: string, utilisateurId: string): Promise<EtatTentative> {
    const quiz = await this.quizDeLecon(slug);
    const enCoursCle = cleEnCours(utilisateurId, quiz.id);
    const existante = await this.prisma.tentative.findUnique({ where: { enCoursCle } });
    if (existante) return versEtat(existante);
    try {
      return versEtat(
        await this.prisma.tentative.create({
          data: { quizId: quiz.id, utilisateurId, enCoursCle, reponses: {} },
        }),
      );
    } catch (error) {
      // Deux onglets démarrent en même temps : l'unicité de enCoursCle garde une seule tentative.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return versEtat(await this.prisma.tentative.findUniqueOrThrow({ where: { enCoursCle } }));
      }
      throw error;
    }
  }

  private async tentativeDe(id: string, utilisateurId: string) {
    const tentative = await this.prisma.tentative.findUnique({ where: { id } });
    // 404 plutôt que 403 : ne pas révéler l'existence de la tentative d'un autre élève.
    if (!tentative || tentative.utilisateurId !== utilisateurId) {
      throw new NotFoundException(TENTATIVE_INTROUVABLE);
    }
    return tentative;
  }

  async enregistrerReponse(
    tentativeId: string,
    questionId: string,
    reponse: Reponse,
    utilisateurId: string,
  ): Promise<void> {
    const tentative = await this.tentativeDe(tentativeId, utilisateurId);
    if (tentative.termineLe) throw new ConflictException(TENTATIVE_TERMINEE);

    const questions = (
      await this.prisma.question.findMany({ where: { quizId: tentative.quizId }, orderBy: { ordre: "asc" } })
    ).map(versQuestionCorrigible);
    const position = questions.findIndex((q) => q.id === questionId);
    const question = questions[position];
    if (!question) throw new BadRequestException("Cette question n'appartient pas à ce quiz.");
    verifierForme(question, reponse);

    // Mise à jour optimiste : n'écrit que si les réponses n'ont pas changé depuis la lecture,
    // pour que deux onglets ne s'écrasent pas mutuellement.
    let courante = tentative;
    for (let essai = 0; essai < ESSAIS_ENREGISTREMENT; essai += 1) {
      const anciennes = (courante.reponses as Record<string, Reponse> | null) ?? {};
      const { count } = await this.prisma.tentative.updateMany({
        where: { id: tentativeId, termineLe: null, reponses: { equals: anciennes } },
        data: { reponses: { ...anciennes, [questionId]: reponse }, position },
      });
      if (count === 1) return;
      courante = await this.tentativeDe(tentativeId, utilisateurId);
      if (courante.termineLe) throw new ConflictException(TENTATIVE_TERMINEE);
    }
    throw new ConflictException("Réponse non enregistrée, réessaie.");
  }

  // Mémorise la question affichée, même sans réponse, pour reprendre exactement au même endroit.
  async definirPosition(tentativeId: string, position: number, utilisateurId: string): Promise<void> {
    const tentative = await this.tentativeDe(tentativeId, utilisateurId);
    if (tentative.termineLe) throw new ConflictException(TENTATIVE_TERMINEE);
    const nombre = await this.prisma.question.count({ where: { quizId: tentative.quizId } });
    if (position < 0 || position >= nombre) throw new BadRequestException("Position hors du quiz.");
    await this.prisma.tentative.updateMany({ where: { id: tentativeId, termineLe: null }, data: { position } });
  }

  async soumettre(tentativeId: string, utilisateurId: string): Promise<ResultatTentative> {
    const tentative = await this.tentativeDe(tentativeId, utilisateurId);
    if (tentative.termineLe) throw new ConflictException(TENTATIVE_TERMINEE);

    const quiz = await this.prisma.quiz.findUniqueOrThrow({
      where: { id: tentative.quizId },
      include: { ...INCLUSION_LECON, questions: { orderBy: { ordre: "asc" } } },
    });
    const reponses = (tentative.reponses as Record<string, Reponse> | null) ?? {};
    const resultat = corrigerTentative(quiz.questions.map(versQuestionCorrigible), reponses);
    const termineLe = new Date();

    const { count } = await this.prisma.tentative.updateMany({
      where: { id: tentativeId, termineLe: null },
      data: {
        termineLe,
        enCoursCle: null,
        score: resultat.score,
        pointsObtenus: resultat.pointsObtenus,
        pointsTotal: resultat.pointsTotal,
        correction: resultat.details as unknown as Prisma.InputJsonValue,
      },
    });
    if (count !== 1) throw new ConflictException(TENTATIVE_TERMINEE);

    return {
      id: tentativeId,
      lecon: versLeconQuiz(quiz.lecon),
      score: resultat.score,
      pointsObtenus: resultat.pointsObtenus,
      pointsTotal: resultat.pointsTotal,
      termineLe: termineLe.toISOString(),
      details: resultat.details,
    };
  }

  async resultat(tentativeId: string, utilisateurId: string): Promise<ResultatTentative> {
    const tentative = await this.tentativeDe(tentativeId, utilisateurId);
    if (!tentative.termineLe) throw new NotFoundException("Ce quiz n'a pas encore été soumis.");
    const quiz = await this.prisma.quiz.findUniqueOrThrow({
      where: { id: tentative.quizId },
      include: INCLUSION_LECON,
    });
    return {
      id: tentative.id,
      lecon: versLeconQuiz(quiz.lecon),
      score: tentative.score ?? 0,
      pointsObtenus: tentative.pointsObtenus ?? 0,
      pointsTotal: tentative.pointsTotal ?? 0,
      termineLe: tentative.termineLe.toISOString(),
      details: (tentative.correction as unknown as ResultatTentative["details"]) ?? [],
    };
  }

  async historique(utilisateurId: string): Promise<ResumeTentative[]> {
    const tentatives = await this.prisma.tentative.findMany({
      where: { utilisateurId },
      orderBy: { demarreLe: "desc" },
      take: 50,
      include: { quiz: { include: INCLUSION_LECON } },
    });
    return tentatives.map((tentative) => ({
      id: tentative.id,
      lecon: versLeconQuiz(tentative.quiz.lecon),
      score: tentative.score,
      demarreLe: tentative.demarreLe.toISOString(),
      termineLe: tentative.termineLe?.toISOString() ?? null,
    }));
  }
}
