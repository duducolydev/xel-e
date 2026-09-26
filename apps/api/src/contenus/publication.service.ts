import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Lecon, type VersionLecon } from "@prisma/client";
import {
  slugifier,
  type CreerChapitreDto,
  type CreerLeconDto,
  type ModifierChapitreDto,
  type ModifierLeconDto,
} from "@xel-e/shared";
import { PrismaService } from "../prisma/prisma.service";
import { rendreLecon, type LeconRendue } from "./rendu-markdown";
import { appliquerAction, type ActionLecon } from "./workflow";

const LECON_INTROUVABLE = "Leçon introuvable.";
const CHAPITRE_INTROUVABLE = "Chapitre introuvable.";

function conflitOrdre(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ConflictException("Cet ordre est déjà utilisé dans ce chapitre.");
  }
  throw error;
}

@Injectable()
export class PublicationService {
  constructor(private readonly prisma: PrismaService) {}

  async creerChapitre(dto: CreerChapitreDto) {
    const [niveau, matiere] = await Promise.all([
      this.prisma.niveau.findUniqueOrThrow({ where: { libelle: dto.niveau } }),
      this.prisma.matiere.findUniqueOrThrow({ where: { libelle: dto.matiere } }),
    ]);
    const ordre =
      dto.ordre ??
      ((await this.prisma.chapitre.aggregate({
        where: { niveauId: niveau.id, matiereId: matiere.id },
        _max: { ordre: true },
      }))._max.ordre ?? 0) + 1;
    return this.prisma.chapitre
      .create({ data: { niveauId: niveau.id, matiereId: matiere.id, titre: dto.titre, ordre } })
      .catch(conflitOrdre);
  }

  async modifierChapitre(id: string, dto: ModifierChapitreDto) {
    await this.chapitreActif(id);
    return this.prisma.chapitre.update({ where: { id }, data: dto }).catch(conflitOrdre);
  }

  async supprimerChapitre(id: string): Promise<void> {
    await this.chapitreActif(id);
    await this.prisma.chapitre.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async listerChapitres(niveau: string, matiere: string) {
    return this.prisma.chapitre.findMany({
      where: { niveau: { libelle: niveau }, matiere: { libelle: matiere }, deletedAt: null },
      orderBy: { ordre: "asc" },
      include: {
        lecons: {
          where: { deletedAt: null },
          orderBy: { ordre: "asc" },
          select: { id: true, slug: true, titre: true, statut: true, version: true, ordre: true },
        },
      },
    });
  }

  private async chapitreActif(id: string) {
    const chapitre = await this.prisma.chapitre.findFirst({ where: { id, deletedAt: null } });
    if (!chapitre) throw new NotFoundException(CHAPITRE_INTROUVABLE);
    return chapitre;
  }

  private async slugDisponible(titre: string): Promise<string> {
    const base = slugifier(titre) || "lecon";
    for (let suffixe = 1; ; suffixe += 1) {
      const candidat = suffixe === 1 ? base : `${base}-${suffixe}`;
      if (!(await this.prisma.lecon.findUnique({ where: { slug: candidat } }))) return candidat;
    }
  }

  async creerLecon(dto: CreerLeconDto, auteurId: string): Promise<Lecon> {
    await this.chapitreActif(dto.chapitreId);
    const ordre =
      dto.ordre ??
      ((await this.prisma.lecon.aggregate({ where: { chapitreId: dto.chapitreId }, _max: { ordre: true } }))
        ._max.ordre ?? 0) + 1;
    return this.prisma.lecon
      .create({
        data: {
          chapitreId: dto.chapitreId,
          titre: dto.titre,
          contenu: dto.contenu ?? "",
          ordre,
          auteurId,
          slug: await this.slugDisponible(dto.titre),
        },
      })
      .catch(conflitOrdre);
  }

  async lecon(id: string) {
    const lecon = await this.prisma.lecon.findFirst({
      where: { id, deletedAt: null },
      include: {
        versionPubliee: { select: { numero: true, titre: true, publieLe: true } },
        chapitre: { include: { niveau: true, matiere: true } },
      },
    });
    if (!lecon) throw new NotFoundException(LECON_INTROUVABLE);
    return lecon;
  }

  async apercu(id: string): Promise<LeconRendue> {
    return rendreLecon((await this.lecon(id)).contenu ?? "");
  }

  private async transition(id: string, action: ActionLecon, data: Prisma.LeconUpdateInput = {}) {
    const lecon = await this.lecon(id);
    const statut = appliquerAction(lecon.statut, action);
    // Mise à jour conditionnelle : échoue si une autre requête a changé le statut entre-temps.
    const { count } = await this.prisma.lecon
      .updateMany({ where: { id, statut: lecon.statut, deletedAt: null }, data: { ...data, statut } as Prisma.LeconUpdateManyMutationInput })
      .catch(conflitOrdre);
    if (count !== 1) throw new ConflictException("La leçon vient d'être modifiée par ailleurs. Recharge-la.");
    return this.lecon(id);
  }

  modifierLecon(id: string, dto: ModifierLeconDto) {
    return this.transition(id, "modifier", dto);
  }

  async soumettre(id: string) {
    const lecon = await this.lecon(id);
    if (!lecon.contenu?.trim()) {
      throw new BadRequestException("Une leçon vide ne peut pas être soumise à la revue.");
    }
    return this.transition(id, "soumettre");
  }

  renvoyerEnBrouillon(id: string) {
    return this.transition(id, "renvoyerEnBrouillon");
  }

  // Publier fige un instantané immuable (titre, source, rendu HTML) : les élèves lisent
  // toujours cette version, même si la copie de travail est ensuite modifiée.
  async publier(id: string, publieParId: string): Promise<VersionLecon> {
    const lecon = await this.lecon(id);
    appliquerAction(lecon.statut, "publier");
    const contenu = lecon.contenu ?? "";
    const rendu = rendreLecon(contenu);

    return this.prisma.$transaction(async (tx) => {
      const numero = lecon.version + 1;
      const { count } = await tx.lecon.updateMany({
        where: { id, statut: "EN_REVUE", version: lecon.version, deletedAt: null },
        data: { statut: "PUBLIE", version: numero },
      });
      if (count !== 1) throw new ConflictException("La leçon vient d'être modifiée par ailleurs. Recharge-la.");

      const version = await tx.versionLecon.create({
        data: {
          leconId: id,
          numero,
          titre: lecon.titre,
          contenu,
          sections: rendu.sections as unknown as Prisma.InputJsonValue,
          resume: rendu.resume,
          publieParId,
        },
      });
      await tx.lecon.update({ where: { id }, data: { versionPublieeId: version.id } });
      return version;
    });
  }

  async supprimerLecon(id: string): Promise<void> {
    await this.lecon(id);
    await this.prisma.lecon.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
