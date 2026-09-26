import { Body, Controller, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import {
  enregistrementReponseSchema,
  positionSchema,
  type EtatTentative,
  type QuizPublic,
  type Reponse,
  type ResultatTentative,
  type ResumeTentative,
} from "@xel-e/shared";
import { CurrentUser, type UtilisateurAuthentifie } from "../auth/decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ProgressionModule } from "../progression/progression.controller";
import { QuizService } from "./quiz.service";

const idValide = new ParseUUIDPipe({ version: "4" });

// Réservé aux comptes connectés : une tentative appartient toujours à un élève.
@Controller("quiz")
export class QuizController {
  constructor(private readonly quiz: QuizService) {}

  @Get("lecons/:slug")
  quizPublic(@Param("slug") slug: string): Promise<QuizPublic> {
    return this.quiz.quizPublic(slug);
  }

  @Get("lecons/:slug/tentative-en-cours")
  async tentativeEnCours(
    @Param("slug") slug: string,
    @CurrentUser() utilisateur: UtilisateurAuthentifie,
  ): Promise<{ tentative: EtatTentative | null }> {
    return { tentative: await this.quiz.tentativeEnCours(slug, utilisateur.id) };
  }

  @Post("lecons/:slug/tentatives")
  @HttpCode(HttpStatus.OK)
  demarrer(@Param("slug") slug: string, @CurrentUser() utilisateur: UtilisateurAuthentifie): Promise<EtatTentative> {
    return this.quiz.demarrer(slug, utilisateur.id);
  }

  @Put("tentatives/:id/reponses/:questionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  enregistrer(
    @Param("id", idValide) id: string,
    @Param("questionId", idValide) questionId: string,
    @Body(new ZodValidationPipe(enregistrementReponseSchema)) corps: { reponse: Reponse },
    @CurrentUser() utilisateur: UtilisateurAuthentifie,
  ): Promise<void> {
    return this.quiz.enregistrerReponse(id, questionId, corps.reponse, utilisateur.id);
  }

  @Put("tentatives/:id/position")
  @HttpCode(HttpStatus.NO_CONTENT)
  definirPosition(
    @Param("id", idValide) id: string,
    @Body(new ZodValidationPipe(positionSchema)) corps: { position: number },
    @CurrentUser() utilisateur: UtilisateurAuthentifie,
  ): Promise<void> {
    return this.quiz.definirPosition(id, corps.position, utilisateur.id);
  }

  @Post("tentatives/:id/soumettre")
  @HttpCode(HttpStatus.OK)
  soumettre(
    @Param("id", idValide) id: string,
    @CurrentUser() utilisateur: UtilisateurAuthentifie,
  ): Promise<ResultatTentative> {
    return this.quiz.soumettre(id, utilisateur.id);
  }

  @Get("tentatives")
  historique(@CurrentUser() utilisateur: UtilisateurAuthentifie): Promise<ResumeTentative[]> {
    return this.quiz.historique(utilisateur.id);
  }

  @Get("tentatives/:id")
  resultat(
    @Param("id", idValide) id: string,
    @CurrentUser() utilisateur: UtilisateurAuthentifie,
  ): Promise<ResultatTentative> {
    return this.quiz.resultat(id, utilisateur.id);
  }
}

@Module({
  imports: [ProgressionModule],
  controllers: [QuizController],
  providers: [QuizService],
})
export class QuizModule {}
