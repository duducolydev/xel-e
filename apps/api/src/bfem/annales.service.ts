import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { AnnaleDto } from "@xel-e/shared";
import { randomUUID } from "node:crypto";
import { StockageService } from "../contenus/stockage.service";
import { AntivirusService } from "../forum/antivirus.service";
import { PrismaService } from "../prisma/prisma.service";
import { AccesPremiumService } from "./acces-premium.service";

export const TAILLE_MAX_ANNALE = 15 * 1024 * 1024;

export function estUnPdf(octets: Buffer): boolean {
  return octets.subarray(0, 5).toString("latin1") === "%PDF-";
}

@Injectable()
export class AnnalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockage: StockageService,
    private readonly antivirus: AntivirusService,
    private readonly premium: AccesPremiumService,
  ) {}

  async lister(lecteur: { id: string; role: string }): Promise<AnnaleDto[]> {
    const acces = await this.premium.lecteur(lecteur);
    const annales = await this.prisma.annale.findMany({
      where: { deletedAt: null },
      orderBy: [{ epreuve: { ordre: "asc" } }, { annee: "desc" }, { titre: "asc" }],
      include: { epreuve: { select: { code: true, libelle: true } } },
    });
    return annales.map((annale) => ({
      id: annale.id,
      epreuve: annale.epreuve,
      annee: annale.annee,
      titre: annale.titre,
      aUnCorrige: annale.corrigeCle !== null,
      premium: annale.premium,
      accessible: !annale.premium || acces.abonne,
    }));
  }

  // Analyse antivirus d'abord (même téléversé par l'administration) : un fichier infecté n'est jamais
  // stocké, quel que soit son type ; puis seuls les PDF sont acceptés.
  private async stockerPdf(octets: Buffer): Promise<string> {
    if (octets.length > TAILLE_MAX_ANNALE) throw new BadRequestException("Le PDF ne doit pas dépasser 15 Mo.");
    const analyse = await this.antivirus.analyser(octets);
    if (!analyse.sain) throw new UnprocessableEntityException("Fichier refusé : l'antivirus y a détecté une menace.");
    if (!estUnPdf(octets)) throw new BadRequestException("Seuls les fichiers PDF sont acceptés.");
    const cle = `annales/${randomUUID()}.pdf`;
    await this.stockage.ecrire(cle, octets, "application/pdf");
    return cle;
  }

  async ajouter(
    meta: { epreuve: string; annee: number; titre: string; premium: boolean },
    sujet: Buffer,
    corrige: Buffer | undefined,
  ): Promise<AnnaleDto> {
    const epreuve = await this.prisma.epreuveBfem.findUnique({ where: { code: meta.epreuve } });
    if (!epreuve) throw new BadRequestException("Épreuve inconnue.");
    const sujetCle = await this.stockerPdf(sujet);
    const corrigeCle = corrige ? await this.stockerPdf(corrige) : null;
    const annale = await this.prisma.annale.create({
      data: { epreuveId: epreuve.id, annee: meta.annee, titre: meta.titre, premium: meta.premium, sujetCle, corrigeCle },
    });
    return {
      id: annale.id,
      epreuve: { code: epreuve.code, libelle: epreuve.libelle },
      annee: annale.annee,
      titre: annale.titre,
      aUnCorrige: corrigeCle !== null,
      premium: annale.premium,
      accessible: true,
    };
  }

  async telecharger(id: string, fichier: "sujet" | "corrige", lecteur: { id: string; role: string }) {
    const annale = await this.prisma.annale.findFirst({ where: { id, deletedAt: null }, include: { epreuve: true } });
    const cle = fichier === "sujet" ? annale?.sujetCle : annale?.corrigeCle;
    if (!annale || !cle) throw new NotFoundException("Annale introuvable.");
    this.premium.exiger(annale, await this.premium.lecteur(lecteur));
    const objet = await this.stockage.lire(cle);
    if (!objet) throw new NotFoundException("Annale introuvable.");
    const nom = `bfem-${annale.annee}-${annale.epreuve.code.toLowerCase()}-${fichier}.pdf`;
    return { nom, corps: objet.corps };
  }

  async supprimer(id: string): Promise<void> {
    const { count } = await this.prisma.annale.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count === 0) throw new NotFoundException("Annale introuvable.");
  }
}
