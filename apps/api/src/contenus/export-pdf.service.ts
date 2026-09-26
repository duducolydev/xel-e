import { Injectable, Logger } from "@nestjs/common";
import type { LeconPubliee } from "@xel-e/shared";
import { CatalogueService } from "./catalogue.service";
import { cleMedia } from "./medias.service";
import { gabaritPdf, PdfService } from "./pdf.service";
import { PREFIXE_MEDIAS } from "./rendu-markdown";
import { StockageService } from "./stockage.service";

export interface PdfLecon {
  nomFichier: string;
  contenu: Buffer;
}

@Injectable()
export class ExportPdfService {
  private readonly logger = new Logger(ExportPdfService.name);

  constructor(
    private readonly catalogue: CatalogueService,
    private readonly stockage: StockageService,
    private readonly pdf: PdfService,
  ) {}

  // Une version publiée est immuable : son PDF est généré une fois puis servi depuis le stockage.
  async pdfLecon(slug: string): Promise<PdfLecon> {
    const { lecon, version } = await this.catalogue.versionEnLigne(slug);
    const nomFichier = `${slug}-v${version.numero}.pdf`;
    const cle = `pdf/lecons/${version.id}.pdf`;

    const enCache = await this.stockage.lire(cle).catch(() => null);
    if (enCache) return { nomFichier, contenu: enCache.corps };

    const contenu = await this.pdf.genererDepuisHtml(await gabaritPdf(await this.integrerImages(lecon)));
    await this.stockage.ecrire(cle, contenu, "application/pdf").catch((error: Error) => {
      this.logger.warn(`PDF non mis en cache (${cle}) : ${error.message}`);
    });
    return { nomFichier, contenu };
  }

  private async integrerImages(lecon: LeconPubliee): Promise<LeconPubliee> {
    const motif = new RegExp(`src="${PREFIXE_MEDIAS}([^"]+)"`, "g");
    const sections = await Promise.all(
      lecon.sections.map(async (section) => {
        let html = section.html;
        for (const [, fichier] of section.html.matchAll(motif)) {
          if (!fichier) continue;
          const objet = await this.stockage.lire(cleMedia(fichier)).catch(() => null);
          if (objet) {
            const dataUri = `data:${objet.type};base64,${objet.corps.toString("base64")}`;
            html = html.split(`src="${PREFIXE_MEDIAS}${fichier}"`).join(`src="${dataUri}"`);
          }
        }
        return { ...section, html };
      }),
    );
    return { ...lecon, sections };
  }
}
