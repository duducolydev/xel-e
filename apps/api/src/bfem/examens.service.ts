import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type QuestionExamen } from "@prisma/client";
import {
  slugifier,
  type ChoixPublic,
  type EtatCopie,
  type ExamenAdmin,
  type ExamenBlancDto,
  type ExamenDetail,
  type ExamenResume,
  type Reponse,
  type ResultatCopie,
} from "@xel-e/shared";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { corrigerTentative, type QuestionCorrigible } from "../quiz/correction";
import { versQuestionPublique } from "../quiz/quiz-public";
import { versBrouillon, versDonneesQuestion } from "../studio/quiz-brouillon";
import { AccesPremiumService } from "./acces-premium.service";
import { calculerExpiration, estExpiree, noteSur20, reponsesRetenues, type ReponseHorodatee } from "./regles";

const EXAMEN_INTROUVABLE = "Cet examen blanc n'existe pas ou n'est pas encore publié.";
const COPIE_INTROUVABLE = "Copie introuvable.";
export const TEMPS_ECOULE = "Le temps est écoulé : ta copie a été rendue automatiquement.";
const ESSAIS_ENREGISTREMENT = 5;

const INCLUSION_EXAMEN = {
  epreuve: true,
  questions: { orderBy: { ordre: "asc" } },
} satisfies Prisma.ExamenBlancInclude;

type ExamenComplet = Prisma.ExamenBlancGetPayload<{ include: typeof INCLUSION_EXAMEN }>;

function versCorrigible(question: QuestionExamen): QuestionCorrigible {
  return { ...question, choix: (question.choix as ChoixPublic[] | null) ?? null };
}

function cleEnCours(eleveId: string, examenId: string): string {
  return `${eleveId}:${examenId}`;
}

export interface Programmateur {
  programmer(copieId: string, expireLe: Date): Promise<void>;
}

@Injectable()
export class ExamensService {
  private programmateur?: Programmateur;
  private readonly dureeTest?: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly premium: AccesPremiumService,
    config: ConfigService<Env, true>,
  ) {
    this.dureeTest = config.get("EXAMEN_DUREE_TEST_SECONDES", { infer: true });
  }

  // La file BullMQ s'enregistre ici (évite une dépendance circulaire entre service et file).
  brancherProgrammateur(programmateur: Programmateur): void {
    this.programmateur = programmateur;
  }

  // Durée officielle de l'épreuve (remplacée en test par EXAMEN_DUREE_TEST_SECONDES).
  dureeSecondes(epreuve: { dureeMinutes: number | null }): number {
    if (this.dureeTest) return this.dureeTest;
    if (!epreuve.dureeMinutes) throw new ConflictException("La durée de cette épreuve n'est pas encore définie.");
    return epreuve.dureeMinutes * 60;
  }

  private async examenPublie(slug: string): Promise<ExamenComplet> {
    const examen = await this.prisma.examenBlanc.findFirst({ where: { slug, publie: true, deletedAt: null }, include: INCLUSION_EXAMEN });
    if (!examen) throw new NotFoundException(EXAMEN_INTROUVABLE);
    return examen;
  }

  async lister(eleve: { id: string; role: string }): Promise<ExamenResume[]> {
    const lecteur = await this.premium.lecteur(eleve);
    const examens = await this.prisma.examenBlanc.findMany({
      where: { publie: true, deletedAt: null },
      orderBy: [{ epreuve: { ordre: "asc" } }, { createdAt: "asc" }],
      include: {
        ...INCLUSION_EXAMEN,
        copies: { where: { eleveId: eleve.id }, orderBy: { demarreLe: "desc" }, select: { id: true, note: true, soumiseLe: true } },
      },
    });
    return examens.map((examen) => this.resume(examen, lecteur, examen.copies));
  }

  async detail(slug: string, eleve: { id: string; role: string }): Promise<ExamenDetail> {
    const examen = await this.examenPublie(slug);
    const copies = await this.prisma.copieExamen.findMany({
      where: { examenId: examen.id, eleveId: eleve.id },
      orderBy: { demarreLe: "desc" },
      select: { id: true, note: true, soumiseLe: true },
    });
    return { ...this.resume(examen, await this.premium.lecteur(eleve), copies), consignes: examen.consignes };
  }

  private resume(
    examen: ExamenComplet,
    lecteur: { role: string; abonne: boolean },
    copies: { id: string; note: number | null; soumiseLe: Date | null }[],
  ): ExamenResume {
    const derniere = copies.find((c) => c.soumiseLe !== null);
    return {
      slug: examen.slug,
      titre: examen.titre,
      epreuve: { code: examen.epreuve.code, libelle: examen.epreuve.libelle, aVerifier: examen.epreuve.aVerifier },
      dureeMinutes: Math.round((this.dureeTest ?? (examen.epreuve.dureeMinutes ?? 0) * 60) / 60),
      nombreQuestions: examen.questions.length,
      pointsTotal: examen.questions.reduce((total, q) => total + q.bareme, 0),
      premium: examen.premium,
      accessible: !examen.premium || lecteur.abonne,
      derniereNote: derniere?.note ?? null,
      copieEnCours: copies.find((c) => c.soumiseLe === null)?.id ?? null,
    };
  }

  // Démarre l'examen (ou reprend la copie en cours) : le minuteur part du serveur.
  async demarrer(slug: string, eleve: { id: string; role: string }, maintenant = new Date()): Promise<EtatCopie> {
    const examen = await this.examenPublie(slug);
    this.premium.exiger(examen, await this.premium.lecteur(eleve));
    const enCoursCle = cleEnCours(eleve.id, examen.id);
    const existante = await this.prisma.copieExamen.findUnique({ where: { enCoursCle } });
    if (existante) return this.etat(existante.id, eleve.id, maintenant);

    const expireLe = calculerExpiration(maintenant, this.dureeSecondes(examen.epreuve));
    let copieId: string;
    try {
      copieId = (
        await this.prisma.copieExamen.create({
          data: { examenId: examen.id, eleveId: eleve.id, enCoursCle, demarreLe: maintenant, expireLe, reponses: {} },
        })
      ).id;
    } catch (error) {
      // Deux onglets démarrent en même temps : une seule copie en cours (unicité de enCoursCle).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return this.etat((await this.prisma.copieExamen.findUniqueOrThrow({ where: { enCoursCle } })).id, eleve.id, maintenant);
      }
      throw error;
    }
    await this.programmateur?.programmer(copieId, expireLe);
    return this.etat(copieId, eleve.id, maintenant);
  }

  private async copieDe(id: string, eleveId: string) {
    const copie = await this.prisma.copieExamen.findUnique({ where: { id }, include: { examen: { include: INCLUSION_EXAMEN } } });
    // 404 plutôt que 403 : ne pas révéler la copie d'un autre élève.
    if (!copie || copie.eleveId !== eleveId) throw new NotFoundException(COPIE_INTROUVABLE);
    return copie;
  }

  // État d'une copie ; une copie dont le temps est écoulé est rendue automatiquement à la lecture
  // (filet de sécurité si la soumission programmée n'a pas encore eu lieu).
  async etat(id: string, eleveId: string, maintenant = new Date()): Promise<EtatCopie> {
    const copie = await this.copieDe(id, eleveId);
    if (copie.soumiseLe || estExpiree(copie.expireLe, maintenant)) {
      return { terminee: true, ...(await this.finaliser(id, maintenant)) };
    }
    const reponses = copie.reponses as unknown as Record<string, ReponseHorodatee>;
    return {
      terminee: false,
      id: copie.id,
      examen: { slug: copie.examen.slug, titre: copie.examen.titre, epreuve: copie.examen.epreuve.libelle },
      questions: copie.examen.questions.map((q) => versQuestionPublique(versCorrigible(q))),
      reponses: Object.fromEntries(Object.entries(reponses).map(([questionId, r]) => [questionId, r.valeur])),
      demarreLe: copie.demarreLe.toISOString(),
      expireLe: copie.expireLe.toISOString(),
      maintenant: maintenant.toISOString(),
    };
  }

  // Chaque réponse est horodatée par le serveur ; après la limite, plus rien n'est accepté.
  async repondre(id: string, questionId: string, reponse: Reponse, eleveId: string, maintenant = new Date()): Promise<void> {
    let copie = await this.copieDe(id, eleveId);
    if (copie.soumiseLe) throw new ConflictException("Cette copie a déjà été rendue.");
    if (estExpiree(copie.expireLe, maintenant)) {
      await this.finaliser(id, maintenant);
      throw new ConflictException(TEMPS_ECOULE);
    }
    if (!copie.examen.questions.some((q) => q.id === questionId)) {
      throw new BadRequestException("Cette question n'appartient pas à cet examen.");
    }
    // Mise à jour optimiste : deux onglets ne s'écrasent pas leurs réponses.
    for (let essai = 0; essai < ESSAIS_ENREGISTREMENT; essai += 1) {
      const anciennes = copie.reponses as Prisma.JsonObject;
      const { count } = await this.prisma.copieExamen.updateMany({
        where: { id, soumiseLe: null, reponses: { equals: anciennes } },
        data: { reponses: { ...anciennes, [questionId]: { valeur: reponse, le: maintenant.toISOString() } } },
      });
      if (count === 1) return;
      copie = await this.copieDe(id, eleveId);
      if (copie.soumiseLe) throw new ConflictException("Cette copie a déjà été rendue.");
    }
    throw new ConflictException("Réponse non enregistrée, réessaie.");
  }

  async soumettre(id: string, eleveId: string, maintenant = new Date()): Promise<ResultatCopie> {
    await this.copieDe(id, eleveId);
    return this.finaliser(id, maintenant);
  }

  // Corrige et rend la copie, une seule fois (idempotent). Seules comptent les réponses reçues avant la
  // limite ; une copie rendue après la limite est marquée « rendue automatiquement ».
  async finaliser(id: string, maintenant = new Date()): Promise<ResultatCopie> {
    const copie = await this.prisma.copieExamen.findUniqueOrThrow({ where: { id }, include: { examen: { include: INCLUSION_EXAMEN } } });
    if (!copie.soumiseLe) {
      const auto = estExpiree(copie.expireLe, maintenant);
      const retenues = reponsesRetenues(copie.reponses as unknown as Record<string, ReponseHorodatee>, copie.expireLe);
      const resultat = corrigerTentative(copie.examen.questions.map(versCorrigible), retenues);
      await this.prisma.copieExamen.updateMany({
        where: { id, soumiseLe: null },
        data: {
          soumiseLe: auto ? copie.expireLe : maintenant,
          soumissionAuto: auto,
          enCoursCle: null,
          note: noteSur20(resultat.pointsObtenus, resultat.pointsTotal),
          pointsObtenus: resultat.pointsObtenus,
          pointsTotal: resultat.pointsTotal,
          correction: resultat.details as unknown as Prisma.InputJsonValue,
        },
      });
    }
    return this.resultatDe(id);
  }

  private async resultatDe(id: string): Promise<ResultatCopie> {
    const copie = await this.prisma.copieExamen.findUniqueOrThrow({ where: { id }, include: { examen: { include: { epreuve: true } } } });
    return {
      id: copie.id,
      examen: { slug: copie.examen.slug, titre: copie.examen.titre, epreuve: copie.examen.epreuve.libelle },
      note: copie.note ?? 0,
      pointsObtenus: copie.pointsObtenus ?? 0,
      pointsTotal: copie.pointsTotal ?? 0,
      soumissionAuto: copie.soumissionAuto,
      demarreLe: copie.demarreLe.toISOString(),
      soumiseLe: (copie.soumiseLe as Date).toISOString(),
      details: (copie.correction as unknown as ResultatCopie["details"]) ?? [],
    };
  }

  async resultat(id: string, eleveId: string): Promise<ResultatCopie> {
    const copie = await this.copieDe(id, eleveId);
    if (!copie.soumiseLe) throw new NotFoundException("Cette copie n'a pas encore été rendue.");
    return this.resultatDe(id);
  }

  // --- Administration ---

  async listerAdmin(): Promise<ExamenAdmin[]> {
    const examens = await this.prisma.examenBlanc.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" }, include: INCLUSION_EXAMEN });
    return examens.map((examen) => ({
      id: examen.id,
      slug: examen.slug,
      titre: examen.titre,
      epreuve: examen.epreuve.code,
      consignes: examen.consignes,
      premium: examen.premium,
      publie: examen.publie,
      questions: versBrouillon(examen.questions),
    }));
  }

  private async epreuveExamen(code: string) {
    const epreuve = await this.prisma.epreuveBfem.findUnique({ where: { code } });
    if (!epreuve || !epreuve.matiere) throw new BadRequestException("Épreuve inconnue ou sans examen blanc sur Xel-E.");
    return epreuve;
  }

  private async slugDisponible(titre: string): Promise<string> {
    const base = slugifier(titre) || "examen-blanc";
    for (let suffixe = 1; ; suffixe += 1) {
      const candidat = suffixe === 1 ? base : `${base}-${suffixe}`;
      if (!(await this.prisma.examenBlanc.findUnique({ where: { slug: candidat } }))) return candidat;
    }
  }

  async creer(dto: ExamenBlancDto): Promise<ExamenAdmin> {
    const epreuve = await this.epreuveExamen(dto.epreuve);
    const examen = await this.prisma.examenBlanc.create({
      data: {
        slug: await this.slugDisponible(dto.titre),
        titre: dto.titre,
        epreuveId: epreuve.id,
        consignes: dto.consignes,
        premium: dto.premium,
        publie: dto.publie,
        questions: {
          create: dto.questions.map((q, i) => {
            const donnees = versDonneesQuestion(q, i + 1);
            return { ...donnees, choix: donnees.choix ?? Prisma.DbNull };
          }),
        },
      },
    });
    return (await this.listerAdmin()).find((e) => e.id === examen.id)!;
  }

  // Les questions ne changent pas tant qu'une copie est en cours (ses réponses y sont rattachées) ;
  // les copies rendues gardent leur corrigé figé.
  async modifier(id: string, dto: ExamenBlancDto): Promise<ExamenAdmin> {
    const examen = await this.prisma.examenBlanc.findFirst({ where: { id, deletedAt: null } });
    if (!examen) throw new NotFoundException("Examen blanc introuvable.");
    const epreuve = await this.epreuveExamen(dto.epreuve);
    if (await this.prisma.copieExamen.count({ where: { examenId: id, soumiseLe: null } })) {
      throw new ConflictException("Des élèves composent en ce moment sur cet examen : réessaie plus tard.");
    }
    await this.prisma.$transaction([
      this.prisma.questionExamen.deleteMany({ where: { examenId: id } }),
      this.prisma.examenBlanc.update({
        where: { id },
        data: {
          titre: dto.titre,
          epreuveId: epreuve.id,
          consignes: dto.consignes,
          premium: dto.premium,
          publie: dto.publie,
          questions: {
            create: dto.questions.map((q, i) => {
              const donnees = versDonneesQuestion(q, i + 1);
              return { ...donnees, choix: donnees.choix ?? Prisma.DbNull };
            }),
          },
        },
      }),
    ]);
    return (await this.listerAdmin()).find((e) => e.id === id)!;
  }
}
