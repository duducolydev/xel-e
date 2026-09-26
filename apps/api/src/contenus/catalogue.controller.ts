import { Controller, Get, Header, Param, Res, StreamableFile } from "@nestjs/common";
import type { EntreePlanDuSite, LeconPubliee, NiveauCatalogue, PageMatiere } from "@xel-e/shared";
import type { Response } from "express";
import { Public } from "../auth/decorators";
import { CatalogueService } from "./catalogue.service";
import { ExportPdfService } from "./export-pdf.service";
import { MediasService } from "./medias.service";

@Public()
@Controller()
export class CatalogueController {
  constructor(
    private readonly catalogue: CatalogueService,
    private readonly exportPdf: ExportPdfService,
    private readonly medias: MediasService,
  ) {}

  @Get("catalogue")
  niveaux(): Promise<NiveauCatalogue[]> {
    return this.catalogue.niveaux();
  }

  @Get("catalogue/plan-du-site")
  planDuSite(): Promise<EntreePlanDuSite[]> {
    return this.catalogue.planDuSite();
  }

  @Get("catalogue/:niveau/:matiere")
  matiere(@Param("niveau") niveau: string, @Param("matiere") matiere: string): Promise<PageMatiere> {
    return this.catalogue.matiere(niveau, matiere);
  }

  @Get("lecons/:slug")
  async lecon(@Param("slug") slug: string): Promise<LeconPubliee> {
    return (await this.catalogue.versionEnLigne(slug)).lecon;
  }

  @Get("lecons/:slug/pdf")
  async pdf(@Param("slug") slug: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const { nomFichier, contenu } = await this.exportPdf.pdfLecon(slug);
    res.setHeader("Content-Disposition", `attachment; filename="${nomFichier}"`);
    return new StreamableFile(contenu, { type: "application/pdf", length: contenu.length });
  }

  @Get("medias/:fichier")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  @Header("X-Content-Type-Options", "nosniff")
  async media(@Param("fichier") fichier: string): Promise<StreamableFile> {
    const objet = await this.medias.lire(fichier);
    return new StreamableFile(objet.corps, { type: objet.type, length: objet.corps.length });
  }
}
