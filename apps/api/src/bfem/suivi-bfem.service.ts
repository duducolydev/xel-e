import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { EpreuveDto, EstimationsDto, HistoriqueBfem, LigneSimulation, ModifierEpreuveDto, SimulationBfem } from "@xel-e/shared";
import { PrismaService } from "../prisma/prisma.service";
import { simulerMoyenne } from "./regles";

function versEpreuve(e: { code: string; libelle: string; matiere: string | null; dureeMinutes: number | null; coefficient: number; aVerifier: boolean }): EpreuveDto {
  return { code: e.code, libelle: e.libelle, matiere: e.matiere, dureeMinutes: e.dureeMinutes, coefficient: e.coefficient, aVerifier: e.aVerifier };
}

// Épreuves (barème), historique des examens blancs et simulation de moyenne.
@Injectable()
export class SuiviBfemService {
  constructor(private readonly prisma: PrismaService) {}

  async epreuves(): Promise<EpreuveDto[]> {
    return (await this.prisma.epreuveBfem.findMany({ orderBy: { ordre: "asc" } })).map(versEpreuve);
  }

  // Saisie des valeurs officielles par l'administration : l'épreuve n'est plus « à vérifier ».
  async modifierEpreuve(code: string, dto: ModifierEpreuveDto): Promise<EpreuveDto> {
    const epreuve = await this.prisma.epreuveBfem.findUnique({ where: { code } });
    if (!epreuve) throw new NotFoundException("Épreuve inconnue.");
    if (epreuve.matiere && dto.dureeMinutes === null) {
      throw new BadRequestException("Une épreuve avec des examens blancs doit avoir une durée.");
    }
    return versEpreuve(
      await this.prisma.epreuveBfem.update({
        where: { code },
        data: { dureeMinutes: dto.dureeMinutes, coefficient: dto.coefficient, aVerifier: false },
      }),
    );
  }

  async historique(eleveId: string): Promise<HistoriqueBfem> {
    const [epreuves, copies] = await Promise.all([
      this.prisma.epreuveBfem.findMany({ where: { matiere: { not: null } }, orderBy: { ordre: "asc" } }),
      this.prisma.copieExamen.findMany({
        where: { eleveId, soumiseLe: { not: null } },
        orderBy: { soumiseLe: "asc" },
        select: { id: true, note: true, soumiseLe: true, soumissionAuto: true, examen: { select: { titre: true, epreuveId: true } } },
      }),
    ]);
    return {
      epreuves: epreuves.map((epreuve) => ({
        code: epreuve.code,
        libelle: epreuve.libelle,
        points: copies
          .filter((c) => c.examen.epreuveId === epreuve.id)
          .map((c) => ({
            copieId: c.id,
            examen: c.examen.titre,
            note: c.note ?? 0,
            le: (c.soumiseLe as Date).toISOString(),
            soumissionAuto: c.soumissionAuto,
          })),
      })),
    };
  }

  // Note retenue par épreuve : celle du dernier examen blanc rendu, sinon l'estimation de l'élève.
  async simulation(eleveId: string): Promise<SimulationBfem> {
    const [epreuves, estimations, copies] = await Promise.all([
      this.prisma.epreuveBfem.findMany({ orderBy: { ordre: "asc" } }),
      this.prisma.estimationBfem.findMany({ where: { eleveId } }),
      this.prisma.copieExamen.findMany({
        where: { eleveId, soumiseLe: { not: null } },
        orderBy: { soumiseLe: "desc" },
        select: { note: true, examen: { select: { epreuveId: true } } },
      }),
    ]);
    const lignes: LigneSimulation[] = epreuves.map((epreuve) => {
      const derniere = copies.find((c) => c.examen.epreuveId === epreuve.id);
      const estimation = estimations.find((e) => e.epreuveId === epreuve.id);
      const note = derniere?.note ?? estimation?.note ?? null;
      return {
        code: epreuve.code,
        libelle: epreuve.libelle,
        coefficient: epreuve.coefficient,
        aVerifier: epreuve.aVerifier,
        note,
        source: derniere ? "examen" : estimation ? "estimation" : null,
      };
    });
    return { lignes, ...simulerMoyenne(lignes) };
  }

  async enregistrerEstimations(eleveId: string, dto: EstimationsDto): Promise<SimulationBfem> {
    const epreuves = await this.prisma.epreuveBfem.findMany({ where: { code: { in: Object.keys(dto.notes) } } });
    if (epreuves.length !== Object.keys(dto.notes).length) throw new BadRequestException("Épreuve inconnue.");
    await this.prisma.$transaction(
      epreuves.map((epreuve) => {
        const note = dto.notes[epreuve.code];
        return note === null || note === undefined
          ? this.prisma.estimationBfem.deleteMany({ where: { eleveId, epreuveId: epreuve.id } })
          : this.prisma.estimationBfem.upsert({
              where: { eleveId_epreuveId: { eleveId, epreuveId: epreuve.id } },
              update: { note },
              create: { eleveId, epreuveId: epreuve.id, note },
            });
      }),
    );
    return this.simulation(eleveId);
  }
}
