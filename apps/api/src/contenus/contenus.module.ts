import { Module } from "@nestjs/common";
import { AdminContenusController } from "./admin-contenus.controller";
import { CatalogueController } from "./catalogue.controller";
import { CatalogueService } from "./catalogue.service";
import { ExportPdfService } from "./export-pdf.service";
import { MediasService } from "./medias.service";
import { PdfService } from "./pdf.service";
import { PublicationService } from "./publication.service";
import { StockageService } from "./stockage.service";
import { VuesService } from "./vues.service";

@Module({
  controllers: [CatalogueController, AdminContenusController],
  providers: [
    CatalogueService,
    PublicationService,
    StockageService,
    MediasService,
    PdfService,
    ExportPdfService,
    VuesService,
  ],
  exports: [PublicationService, MediasService],
})
export class ContenusModule {}
