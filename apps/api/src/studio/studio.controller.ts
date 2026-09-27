import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  apercuSchema,
  creerLeconStudioSchema,
  modifierLeconStudioSchema,
  type ChapitreStudio,
  type CreerLeconStudioDto,
  type LeconStudio,
  type ModifierLeconStudioDto,
  type ResumeLeconStudio,
  type TableauStudio,
} from "@xel-e/shared";
import type { z } from "zod";
import { CurrentUser, Roles, type UtilisateurAuthentifie } from "../auth/decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { FiltreTailleMedia } from "../contenus/admin-contenus.controller";
import { ContenusModule } from "../contenus/contenus.module";
import { MediasService, TAILLE_MAX_MEDIA } from "../contenus/medias.service";
import { PublicationService } from "../contenus/publication.service";
import { rendreLecon, type LeconRendue } from "../contenus/rendu-markdown";
import { StudioService } from "./studio.service";

const idValide = new ParseUUIDPipe({ version: "4" });

// Espace de rédaction : les professeurs y gèrent leurs propres leçons (l'administration aussi).
@Roles("PROFESSEUR", "ADMIN")
@Controller("studio")
export class StudioController {
  constructor(
    private readonly studio: StudioService,
    private readonly publication: PublicationService,
    private readonly medias: MediasService,
  ) {}

  @Get()
  tableau(@CurrentUser() acteur: UtilisateurAuthentifie): Promise<TableauStudio> {
    return this.studio.tableau(acteur);
  }

  @Get("chapitres")
  chapitres(): Promise<ChapitreStudio[]> {
    return this.studio.chapitres();
  }

  @Post("lecons")
  creer(
    @Body(new ZodValidationPipe(creerLeconStudioSchema)) dto: CreerLeconStudioDto,
    @CurrentUser() acteur: UtilisateurAuthentifie,
  ): Promise<LeconStudio> {
    return this.studio.creer(dto, acteur);
  }

  @Get("lecons/:id")
  lecon(@Param("id", idValide) id: string, @CurrentUser() acteur: UtilisateurAuthentifie): Promise<LeconStudio> {
    return this.studio.lecon(id, acteur);
  }

  @Patch("lecons/:id")
  modifier(
    @Param("id", idValide) id: string,
    @Body(new ZodValidationPipe(modifierLeconStudioSchema)) dto: ModifierLeconStudioDto,
    @CurrentUser() acteur: UtilisateurAuthentifie,
  ): Promise<LeconStudio> {
    return this.studio.modifier(id, dto, acteur);
  }

  @Post("lecons/:id/soumettre")
  @HttpCode(HttpStatus.OK)
  soumettre(@Param("id", idValide) id: string, @CurrentUser() acteur: UtilisateurAuthentifie): Promise<LeconStudio> {
    return this.studio.soumettre(id, acteur);
  }

  @Delete("lecons/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  supprimer(@Param("id", idValide) id: string, @CurrentUser() acteur: UtilisateurAuthentifie): Promise<void> {
    return this.publication.supprimerBrouillon(id, acteur);
  }

  // Aperçu du texte en cours de frappe, avec exactement le rendu de la publication.
  @Post("apercu")
  @HttpCode(HttpStatus.OK)
  apercu(@Body(new ZodValidationPipe(apercuSchema)) dto: z.infer<typeof apercuSchema>): LeconRendue {
    return rendreLecon(dto.contenu);
  }

  @Post("medias")
  @UseFilters(FiltreTailleMedia)
  @UseInterceptors(FileInterceptor("fichier", { limits: { fileSize: TAILLE_MAX_MEDIA, files: 1 } }))
  televerser(@UploadedFile() fichier: Express.Multer.File | undefined) {
    if (!fichier) throw new BadRequestException("Aucun fichier reçu (champ « fichier »).");
    return this.medias.enregistrer(fichier.buffer);
  }
}

@Roles("ADMIN")
@Controller("admin/revue")
export class RevueController {
  constructor(private readonly studio: StudioService) {}

  @Get()
  file(): Promise<ResumeLeconStudio[]> {
    return this.studio.fileDeRevue();
  }
}

@Module({
  imports: [ContenusModule],
  controllers: [StudioController, RevueController],
  providers: [StudioService],
})
export class StudioModule {}
