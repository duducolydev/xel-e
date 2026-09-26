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
  Param,
  ParseUUIDPipe,
  Patch,
  PayloadTooLargeException,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  creerChapitreSchema,
  creerLeconSchema,
  MATIERES,
  modifierChapitreSchema,
  modifierLeconSchema,
  NIVEAUX,
  type CreerChapitreDto,
  type CreerLeconDto,
  type ModifierChapitreDto,
  type ModifierLeconDto,
} from "@xel-e/shared";
import type { Response } from "express";
import { z } from "zod";
import { CurrentUser, Roles, type UtilisateurAuthentifie } from "../auth/decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MediasService, TAILLE_MAX_MEDIA } from "./medias.service";
import { PublicationService } from "./publication.service";

const idValide = new ParseUUIDPipe({ version: "4" });

const filtreChapitresSchema = z.object({
  niveau: z.enum(NIVEAUX, { errorMap: () => ({ message: "Niveau inconnu." }) }),
  matiere: z.enum(MATIERES, { errorMap: () => ({ message: "Matière inconnue." }) }),
});

@Catch(PayloadTooLargeException)
class FiltreTailleMedia implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.PAYLOAD_TOO_LARGE)
      .json({ statusCode: 413, message: "L'image ne doit pas dépasser 2 Mo." });
  }
}

@Roles("ADMIN")
@Controller("admin")
export class AdminContenusController {
  constructor(
    private readonly publication: PublicationService,
    private readonly medias: MediasService,
  ) {}

  @Get("chapitres")
  chapitres(@Query(new ZodValidationPipe(filtreChapitresSchema)) filtre: z.infer<typeof filtreChapitresSchema>) {
    return this.publication.listerChapitres(filtre.niveau, filtre.matiere);
  }

  @Post("chapitres")
  creerChapitre(@Body(new ZodValidationPipe(creerChapitreSchema)) dto: CreerChapitreDto) {
    return this.publication.creerChapitre(dto);
  }

  @Patch("chapitres/:id")
  modifierChapitre(
    @Param("id", idValide) id: string,
    @Body(new ZodValidationPipe(modifierChapitreSchema)) dto: ModifierChapitreDto,
  ) {
    return this.publication.modifierChapitre(id, dto);
  }

  @Delete("chapitres/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  supprimerChapitre(@Param("id", idValide) id: string): Promise<void> {
    return this.publication.supprimerChapitre(id);
  }

  @Post("lecons")
  creerLecon(
    @Body(new ZodValidationPipe(creerLeconSchema)) dto: CreerLeconDto,
    @CurrentUser() admin: UtilisateurAuthentifie,
  ) {
    return this.publication.creerLecon(dto, admin.id);
  }

  @Get("lecons/:id")
  lecon(@Param("id", idValide) id: string) {
    return this.publication.lecon(id);
  }

  @Get("lecons/:id/apercu")
  apercu(@Param("id", idValide) id: string) {
    return this.publication.apercu(id);
  }

  @Patch("lecons/:id")
  modifierLecon(
    @Param("id", idValide) id: string,
    @Body(new ZodValidationPipe(modifierLeconSchema)) dto: ModifierLeconDto,
  ) {
    return this.publication.modifierLecon(id, dto);
  }

  @Post("lecons/:id/soumettre")
  @HttpCode(HttpStatus.OK)
  soumettre(@Param("id", idValide) id: string) {
    return this.publication.soumettre(id);
  }

  @Post("lecons/:id/renvoyer-en-brouillon")
  @HttpCode(HttpStatus.OK)
  renvoyerEnBrouillon(@Param("id", idValide) id: string) {
    return this.publication.renvoyerEnBrouillon(id);
  }

  @Post("lecons/:id/publier")
  @HttpCode(HttpStatus.OK)
  publier(@Param("id", idValide) id: string, @CurrentUser() admin: UtilisateurAuthentifie) {
    return this.publication.publier(id, admin.id);
  }

  @Delete("lecons/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  supprimerLecon(@Param("id", idValide) id: string): Promise<void> {
    return this.publication.supprimerLecon(id);
  }

  @Post("medias")
  @UseFilters(FiltreTailleMedia)
  @UseInterceptors(FileInterceptor("fichier", { limits: { fileSize: TAILLE_MAX_MEDIA, files: 1 } }))
  televerser(@UploadedFile() fichier: Express.Multer.File | undefined) {
    if (!fichier) throw new BadRequestException("Aucun fichier reçu (champ « fichier »).");
    return this.medias.enregistrer(fichier.buffer);
  }
}
