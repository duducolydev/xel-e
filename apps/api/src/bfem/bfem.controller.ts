import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  PayloadTooLargeException,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import {
  accorderAbonnementSchema,
  enregistrementReponseSchema,
  estimationsSchema,
  examenBlancSchema,
  metaAnnaleSchema,
  modifierEpreuveSchema,
  type AnnaleDto,
  type EpreuveDto,
  type EstimationsDto,
  type EtatCopie,
  type ExamenAdmin,
  type ExamenBlancDto,
  type ExamenDetail,
  type ExamenResume,
  type HistoriqueBfem,
  type ModifierEpreuveDto,
  type Reponse,
  type ResultatCopie,
  type SimulationBfem,
} from "@xel-e/shared";
import type { Response } from "express";
import type { z } from "zod";
import { CurrentUser, Roles, type UtilisateurAuthentifie } from "../auth/decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ContenusModule } from "../contenus/contenus.module";
import { ForumModule } from "../forum/forum.controller";
import { AccesPremiumService } from "./acces-premium.service";
import { AnnalesService, TAILLE_MAX_ANNALE } from "./annales.service";
import { ExamensService } from "./examens.service";
import { FileExamens } from "./file-examens";
import { SuiviBfemService } from "./suivi-bfem.service";

const idValide = new ParseUUIDPipe({ version: "4" });

@Catch(PayloadTooLargeException)
class FiltreTailleAnnale implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.PAYLOAD_TOO_LARGE)
      .json({ statusCode: 413, message: "Le PDF ne doit pas dépasser 15 Mo." });
  }
}

// Espace BFEM de l'élève (l'administration y a aussi accès pour relire les examens).
@Roles("ELEVE", "ADMIN")
@Controller("bfem")
export class BfemController {
  constructor(
    private readonly examens: ExamensService,
    private readonly annales: AnnalesService,
    private readonly suivi: SuiviBfemService,
  ) {}

  @Get("examens")
  lister(@CurrentUser() eleve: UtilisateurAuthentifie): Promise<ExamenResume[]> {
    return this.examens.lister(eleve);
  }

  @Get("examens/:slug")
  detail(@Param("slug") slug: string, @CurrentUser() eleve: UtilisateurAuthentifie): Promise<ExamenDetail> {
    return this.examens.detail(slug, eleve);
  }

  @Post("examens/:slug/copies")
  @HttpCode(HttpStatus.OK)
  demarrer(@Param("slug") slug: string, @CurrentUser() eleve: UtilisateurAuthentifie): Promise<EtatCopie> {
    return this.examens.demarrer(slug, eleve);
  }

  @Get("copies/:id")
  copie(@Param("id", idValide) id: string, @CurrentUser() eleve: UtilisateurAuthentifie): Promise<EtatCopie> {
    return this.examens.etat(id, eleve.id);
  }

  @Put("copies/:id/reponses/:questionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  repondre(
    @Param("id", idValide) id: string,
    @Param("questionId", idValide) questionId: string,
    @Body(new ZodValidationPipe(enregistrementReponseSchema)) corps: { reponse: Reponse },
    @CurrentUser() eleve: UtilisateurAuthentifie,
  ): Promise<void> {
    return this.examens.repondre(id, questionId, corps.reponse, eleve.id);
  }

  @Post("copies/:id/soumettre")
  @HttpCode(HttpStatus.OK)
  soumettre(@Param("id", idValide) id: string, @CurrentUser() eleve: UtilisateurAuthentifie): Promise<ResultatCopie> {
    return this.examens.soumettre(id, eleve.id);
  }

  @Get("copies/:id/resultat")
  resultat(@Param("id", idValide) id: string, @CurrentUser() eleve: UtilisateurAuthentifie): Promise<ResultatCopie> {
    return this.examens.resultat(id, eleve.id);
  }

  @Get("annales")
  listerAnnales(@CurrentUser() eleve: UtilisateurAuthentifie): Promise<AnnaleDto[]> {
    return this.annales.lister(eleve);
  }

  @Get("annales/:id/:fichier")
  async telecharger(
    @Param("id", idValide) id: string,
    @Param("fichier") fichier: string,
    @CurrentUser() eleve: UtilisateurAuthentifie,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (fichier !== "sujet" && fichier !== "corrige") throw new BadRequestException("Fichier inconnu.");
    const pdf = await this.annales.telecharger(id, fichier, eleve);
    res.setHeader("Content-Disposition", `attachment; filename="${pdf.nom}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(pdf.corps, { type: "application/pdf", length: pdf.corps.length });
  }

  @Get("historique")
  historique(@CurrentUser() eleve: UtilisateurAuthentifie): Promise<HistoriqueBfem> {
    return this.suivi.historique(eleve.id);
  }

  @Get("simulation")
  simulation(@CurrentUser() eleve: UtilisateurAuthentifie): Promise<SimulationBfem> {
    return this.suivi.simulation(eleve.id);
  }

  @Put("simulation")
  estimer(
    @Body(new ZodValidationPipe(estimationsSchema)) dto: EstimationsDto,
    @CurrentUser() eleve: UtilisateurAuthentifie,
  ): Promise<SimulationBfem> {
    return this.suivi.enregistrerEstimations(eleve.id, dto);
  }

  @Get("epreuves")
  epreuves(): Promise<EpreuveDto[]> {
    return this.suivi.epreuves();
  }
}

@Roles("ADMIN")
@Controller("admin")
export class AdminBfemController {
  constructor(
    private readonly examens: ExamensService,
    private readonly annales: AnnalesService,
    private readonly suivi: SuiviBfemService,
    private readonly premium: AccesPremiumService,
  ) {}

  @Patch("bfem/epreuves/:code")
  modifierEpreuve(
    @Param("code") code: string,
    @Body(new ZodValidationPipe(modifierEpreuveSchema)) dto: ModifierEpreuveDto,
  ): Promise<EpreuveDto> {
    return this.suivi.modifierEpreuve(code, dto);
  }

  @Get("bfem/examens")
  listerExamens(): Promise<ExamenAdmin[]> {
    return this.examens.listerAdmin();
  }

  @Post("bfem/examens")
  creerExamen(@Body(new ZodValidationPipe(examenBlancSchema)) dto: ExamenBlancDto): Promise<ExamenAdmin> {
    return this.examens.creer(dto);
  }

  @Put("bfem/examens/:id")
  modifierExamen(
    @Param("id", idValide) id: string,
    @Body(new ZodValidationPipe(examenBlancSchema)) dto: ExamenBlancDto,
  ): Promise<ExamenAdmin> {
    return this.examens.modifier(id, dto);
  }

  @Post("bfem/annales")
  @UseFilters(FiltreTailleAnnale)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "sujet", maxCount: 1 },
        { name: "corrige", maxCount: 1 },
      ],
      { limits: { fileSize: TAILLE_MAX_ANNALE, files: 2 } },
    ),
  )
  ajouterAnnale(
    @UploadedFiles() fichiers: { sujet?: Express.Multer.File[]; corrige?: Express.Multer.File[] } | undefined,
    @Body(new ZodValidationPipe(metaAnnaleSchema)) meta: z.infer<typeof metaAnnaleSchema>,
  ): Promise<AnnaleDto> {
    const sujet = fichiers?.sujet?.[0];
    if (!sujet) throw new BadRequestException("Le PDF du sujet est obligatoire (champ « sujet »).");
    return this.annales.ajouter(meta, sujet.buffer, fichiers?.corrige?.[0]?.buffer);
  }

  @Delete("bfem/annales/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  supprimerAnnale(@Param("id", idValide) id: string): Promise<void> {
    return this.annales.supprimer(id);
  }

  // En attendant les paiements (Phase 10) : accès Premium accordé à la main.
  @Post("abonnements")
  accorder(@Body(new ZodValidationPipe(accorderAbonnementSchema)) dto: z.infer<typeof accorderAbonnementSchema>) {
    return this.premium.accorder(dto.login, dto.jours);
  }
}

@Module({
  imports: [ContenusModule, ForumModule],
  controllers: [BfemController, AdminBfemController],
  providers: [ExamensService, AnnalesService, SuiviBfemService, AccesPremiumService, FileExamens],
  exports: [FileExamens, ExamensService],
})
export class BfemModule {}
