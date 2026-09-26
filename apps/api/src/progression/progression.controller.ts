import { Body, Controller, Get, HttpCode, HttpStatus, Module, Param, Post, Put } from "@nestjs/common";
import {
  reglageClassementSchema,
  type Classement,
  type EtatLeconEleve,
  type ReglageClassementDto,
  type ResultatLeconTerminee,
  type TableauDeBordProgression,
} from "@xel-e/shared";
import { CurrentUser, type UtilisateurAuthentifie } from "../auth/decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ProgressionService } from "./progression.service";

@Controller("progression")
export class ProgressionController {
  constructor(private readonly progression: ProgressionService) {}

  @Get("tableau-de-bord")
  tableauDeBord(@CurrentUser() utilisateur: UtilisateurAuthentifie): Promise<TableauDeBordProgression> {
    return this.progression.tableauDeBord(utilisateur.id);
  }

  @Get("lecons/:slug")
  etatLecon(@Param("slug") slug: string, @CurrentUser() utilisateur: UtilisateurAuthentifie): Promise<EtatLeconEleve> {
    return this.progression.etatLecon(slug, utilisateur.id);
  }

  @Post("lecons/:slug/terminer")
  @HttpCode(HttpStatus.OK)
  terminerLecon(
    @Param("slug") slug: string,
    @CurrentUser() utilisateur: UtilisateurAuthentifie,
  ): Promise<ResultatLeconTerminee> {
    return this.progression.terminerLecon(slug, utilisateur.id);
  }

  @Post("notifications/lues")
  @HttpCode(HttpStatus.NO_CONTENT)
  marquerLues(@CurrentUser() utilisateur: UtilisateurAuthentifie): Promise<void> {
    return this.progression.marquerNotificationsLues(utilisateur.id);
  }

  @Get("classement")
  classement(@CurrentUser() utilisateur: UtilisateurAuthentifie): Promise<Classement> {
    return this.progression.classement(utilisateur.id);
  }

  @Put("classement")
  @HttpCode(HttpStatus.NO_CONTENT)
  reglerClassement(
    @Body(new ZodValidationPipe(reglageClassementSchema)) dto: ReglageClassementDto,
    @CurrentUser() utilisateur: UtilisateurAuthentifie,
  ): Promise<void> {
    return this.progression.reglerClassement(utilisateur.id, dto);
  }
}

@Module({
  controllers: [ProgressionController],
  providers: [ProgressionService],
  exports: [ProgressionService],
})
export class ProgressionModule {}
