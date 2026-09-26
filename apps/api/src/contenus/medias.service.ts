import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PREFIXE_MEDIAS } from "./rendu-markdown";
import { StockageService, type ObjetStocke } from "./stockage.service";

export const TAILLE_MAX_MEDIA = 2 * 1024 * 1024;

interface FormatImage {
  extension: string;
  type: string;
  signature: (octets: Buffer) => boolean;
}

// Le type est déduit des premiers octets, jamais du nom ni du type annoncé par le client.
// Pas de SVG : il peut embarquer du script.
const FORMATS: FormatImage[] = [
  { extension: "png", type: "image/png", signature: (o) => o.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) },
  { extension: "jpg", type: "image/jpeg", signature: (o) => o.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")) },
  { extension: "gif", type: "image/gif", signature: (o) => /^GIF8[79]a$/.test(o.subarray(0, 6).toString("latin1")) },
  {
    extension: "webp",
    type: "image/webp",
    signature: (o) => o.subarray(0, 4).toString("latin1") === "RIFF" && o.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

const NOM_FICHIER = /^[a-f0-9]{64}\.(png|jpg|gif|webp)$/;

export function cleMedia(fichier: string): string {
  return `medias/${fichier}`;
}

export function detecterFormat(octets: Buffer): FormatImage | undefined {
  return FORMATS.find((format) => format.signature(octets));
}

@Injectable()
export class MediasService {
  constructor(private readonly stockage: StockageService) {}

  // Nom dérivé du contenu (SHA-256) : un même fichier n'est stocké qu'une fois, et son URL
  // ne change jamais, ce qui autorise un cache navigateur permanent.
  async enregistrer(octets: Buffer): Promise<{ fichier: string; url: string }> {
    if (octets.length === 0) throw new BadRequestException("Le fichier est vide.");
    if (octets.length > TAILLE_MAX_MEDIA) {
      throw new BadRequestException("L'image ne doit pas dépasser 2 Mo.");
    }
    const format = detecterFormat(octets);
    if (!format) throw new BadRequestException("Format non accepté : PNG, JPEG, GIF ou WebP uniquement.");

    const fichier = `${createHash("sha256").update(octets).digest("hex")}.${format.extension}`;
    await this.stockage.ecrire(cleMedia(fichier), octets, format.type);
    return { fichier, url: `${PREFIXE_MEDIAS}${fichier}` };
  }

  async lire(fichier: string): Promise<ObjetStocke> {
    const objet = NOM_FICHIER.test(fichier) ? await this.stockage.lire(cleMedia(fichier)) : null;
    if (!objet) throw new NotFoundException("Image introuvable.");
    return objet;
  }
}
