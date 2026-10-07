import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { TAILLE_MAX_PIECE_JOINTE, type PieceJointePublique } from "@xel-e/shared";
import { randomUUID } from "node:crypto";
import { StockageService } from "../contenus/stockage.service";
import { PrismaService } from "../prisma/prisma.service";
import { AntivirusService } from "./antivirus.service";
import { versPieceJointePublique } from "./serialisation";

interface FormatAccepte {
  extension: string;
  type: string;
  signature: (octets: Buffer) => boolean;
}

// Le type est déduit des premiers octets, jamais du nom ni du type annoncé par le navigateur.
const FORMATS: FormatAccepte[] = [
  { extension: "png", type: "image/png", signature: (o) => o.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) },
  { extension: "jpg", type: "image/jpeg", signature: (o) => o.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")) },
  { extension: "gif", type: "image/gif", signature: (o) => /^GIF8[79]a$/.test(o.subarray(0, 6).toString("latin1")) },
  {
    extension: "webp",
    type: "image/webp",
    signature: (o) => o.subarray(0, 4).toString("latin1") === "RIFF" && o.subarray(8, 12).toString("latin1") === "WEBP",
  },
  { extension: "pdf", type: "application/pdf", signature: (o) => o.subarray(0, 5).toString("latin1") === "%PDF-" },
];

export function detecterFormat(octets: Buffer): FormatAccepte | undefined {
  return FORMATS.find((format) => format.signature(octets));
}

// Nom affiché seulement (le fichier est stocké sous un identifiant aléatoire) : on le nettoie quand même.
export function nettoyerNom(nom: string, extension: string): string {
  const base = nom
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} ._-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .replace(/\.[^.]*$/, "");
  return `${base || "fichier"}.${extension}`;
}

export interface FichierRecu {
  octets: Buffer;
  nom: string;
}

@Injectable()
export class PiecesJointesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockage: StockageService,
    private readonly antivirus: AntivirusService,
  ) {}

  async televerser(fichier: FichierRecu, auteurId: string): Promise<PieceJointePublique> {
    if (fichier.octets.length === 0) throw new BadRequestException("Le fichier est vide.");
    if (fichier.octets.length > TAILLE_MAX_PIECE_JOINTE) {
      throw new BadRequestException("Le fichier ne doit pas dépasser 5 Mo.");
    }
    // Analyse avant toute autre chose : un fichier infecté n'est jamais stocké, quel que soit son type.
    const analyse = await this.antivirus.analyser(fichier.octets);
    if (!analyse.sain) {
      throw new UnprocessableEntityException("Fichier refusé : l'antivirus y a détecté une menace.");
    }
    const format = detecterFormat(fichier.octets);
    if (!format) throw new BadRequestException("Seules les images (PNG, JPEG, GIF, WebP) et les PDF sont acceptés.");

    const cle = `forum/${randomUUID()}.${format.extension}`;
    await this.stockage.ecrire(cle, fichier.octets, format.type);
    const piece = await this.prisma.pieceJointe.create({
      data: { auteurId, cle, nomOriginal: nettoyerNom(fichier.nom, format.extension), type: format.type, taille: fichier.octets.length },
    });
    return versPieceJointePublique(piece);
  }

  // Une pièce jointe se lit si son message est visible ; son auteur et l'administration la lisent toujours.
  async lire(id: string, lecteur: { id: string; role: string }) {
    const piece = await this.prisma.pieceJointe.findUnique({
      where: { id },
      include: { message: { select: { masque: true, deletedAt: true, sujet: { select: { deletedAt: true } } } } },
    });
    const visible = !!piece?.message && !piece.message.masque && !piece.message.deletedAt && !piece.message.sujet.deletedAt;
    if (!piece || !(visible || piece.auteurId === lecteur.id || lecteur.role === "ADMIN")) {
      throw new NotFoundException("Pièce jointe introuvable.");
    }
    const objet = await this.stockage.lire(piece.cle);
    if (!objet) throw new NotFoundException("Pièce jointe introuvable.");
    return { nom: piece.nomOriginal, type: piece.type, corps: objet.corps };
  }
}
