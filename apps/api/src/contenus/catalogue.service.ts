import { Injectable, NotFoundException } from "@nestjs/common";
import type { VersionLecon } from "@prisma/client";
import {
  INFOS_MATIERES,
  matiereParSlug,
  NIVEAUX,
  type EntreePlanDuSite,
  type LeconPubliee,
  type LeconResumee,
  type Matiere,
  type Niveau,
  type NiveauCatalogue,
  type PageMatiere,
  type SectionLecon,
} from "@xel-e/shared";
import { PrismaService } from "../prisma/prisma.service";
import { FILTRE_LECONS_PUBLIQUES } from "./workflow";

const LECON_INTROUVABLE = "Cette leçon n'existe pas ou n'est pas encore publiée.";

// Seuls les professeurs sont crédités : les contenus de l'équipe (admins) restent anonymes.
export function attribution(auteur: { role: string; nomComplet: string } | null): string | null {
  return auteur?.role === "PROFESSEUR" ? `Pr ${auteur.nomComplet}` : null;
}

export interface VersionEnLigne {
  lecon: LeconPubliee;
  version: VersionLecon;
}

// Lecture publique : uniquement la dernière version publiée, jamais la copie de travail.
@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  async niveaux(): Promise<NiveauCatalogue[]> {
    const comptes = await this.prisma.lecon.groupBy({
      by: ["chapitreId"],
      where: FILTRE_LECONS_PUBLIQUES,
      _count: { _all: true },
    });
    const chapitres = await this.prisma.chapitre.findMany({
      where: { id: { in: comptes.map((c) => c.chapitreId) } },
      select: { id: true, niveau: { select: { libelle: true } }, matiere: { select: { libelle: true } } },
    });
    const parCle = new Map<string, number>();
    for (const compte of comptes) {
      const chapitre = chapitres.find((c) => c.id === compte.chapitreId);
      if (!chapitre) continue;
      const cle = `${chapitre.niveau.libelle}|${chapitre.matiere.libelle}`;
      parCle.set(cle, (parCle.get(cle) ?? 0) + compte._count._all);
    }
    return NIVEAUX.map((niveau) => ({
      niveau,
      matieres: Object.values(INFOS_MATIERES).map((info) => ({
        ...info,
        nombreLecons: parCle.get(`${niveau}|${info.libelle}`) ?? 0,
      })),
    }));
  }

  async matiere(niveau: string, slugMatiere: string): Promise<PageMatiere> {
    const info = matiereParSlug(slugMatiere);
    if (!info || !(NIVEAUX as readonly string[]).includes(niveau)) {
      throw new NotFoundException("Niveau ou matière inconnu.");
    }
    const chapitres = await this.prisma.chapitre.findMany({
      where: { niveau: { libelle: niveau }, matiere: { libelle: info.libelle }, deletedAt: null },
      orderBy: { ordre: "asc" },
      select: {
        titre: true,
        lecons: {
          where: FILTRE_LECONS_PUBLIQUES,
          orderBy: { ordre: "asc" },
          select: { slug: true, versionPubliee: { select: { titre: true } } },
        },
      },
    });
    const avecLecons = chapitres
      .map((chapitre) => ({
        titre: chapitre.titre,
        lecons: chapitre.lecons.map((l) => ({ slug: l.slug, titre: l.versionPubliee?.titre ?? "" })),
      }))
      .filter((chapitre) => chapitre.lecons.length > 0);
    return {
      niveau: niveau as Niveau,
      matiere: { ...info, nombreLecons: avecLecons.reduce((total, c) => total + c.lecons.length, 0) },
      chapitres: avecLecons,
    };
  }

  async versionEnLigne(slug: string): Promise<VersionEnLigne> {
    const lecon = await this.prisma.lecon.findFirst({
      where: { slug, ...FILTRE_LECONS_PUBLIQUES },
      include: {
        versionPubliee: true,
        auteur: { select: { role: true, nomComplet: true } },
        quiz: { select: { deletedAt: true, _count: { select: { questions: true } } } },
        chapitre: {
          include: {
            niveau: true,
            matiere: true,
            lecons: {
              where: FILTRE_LECONS_PUBLIQUES,
              orderBy: { ordre: "asc" },
              select: { slug: true, versionPubliee: { select: { titre: true } } },
            },
          },
        },
      },
    });
    if (!lecon?.versionPubliee) throw new NotFoundException(LECON_INTROUVABLE);

    const version = lecon.versionPubliee;
    const voisines: LeconResumee[] = lecon.chapitre.lecons.map((l) => ({
      slug: l.slug,
      titre: l.versionPubliee?.titre ?? "",
    }));
    const position = voisines.findIndex((l) => l.slug === slug);
    const info = INFOS_MATIERES[lecon.chapitre.matiere.libelle as Matiere];

    return {
      version,
      lecon: {
        slug,
        titre: version.titre,
        resume: version.resume,
        version: version.numero,
        publieLe: version.publieLe.toISOString(),
        niveau: lecon.chapitre.niveau.libelle as Niveau,
        matiere: { libelle: info.libelle, slug: info.slug, nom: info.nom },
        chapitre: lecon.chapitre.titre,
        sections: version.sections as unknown as SectionLecon[],
        aUnQuiz: !!lecon.quiz && lecon.quiz.deletedAt === null && lecon.quiz._count.questions > 0,
        auteur: attribution(lecon.auteur),
        precedente: voisines[position - 1] ?? null,
        suivante: voisines[position + 1] ?? null,
      },
    };
  }

  async planDuSite(): Promise<EntreePlanDuSite[]> {
    const lecons = await this.prisma.lecon.findMany({
      where: FILTRE_LECONS_PUBLIQUES,
      select: {
        slug: true,
        versionPubliee: { select: { publieLe: true } },
        chapitre: { select: { niveau: { select: { libelle: true } }, matiere: { select: { libelle: true } } } },
      },
    });
    return lecons.map((lecon) => ({
      niveau: lecon.chapitre.niveau.libelle as Niveau,
      matiere: INFOS_MATIERES[lecon.chapitre.matiere.libelle as Matiere].slug,
      slug: lecon.slug,
      publieLe: (lecon.versionPubliee?.publieLe ?? new Date()).toISOString(),
    }));
  }
}
