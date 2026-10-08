import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  creerSujetSchema,
  pseudonymeForumSchema,
  repondreSchema,
  signalementSchema,
  TAILLE_MAX_PIECE_JOINTE,
  termeInterditSchema,
  type CreerSujetDto,
  type ElementModeration,
  type EtatForum,
  type PageForum,
  type PieceJointePublique,
  type RepondreDto,
  type SignalementDto,
  type SujetForumDetail,
  type TermeInterditDto,
} from "@xel-e/shared";
import type { Response } from "express";
import type { z } from "zod";
import { CurrentUser, Roles, type UtilisateurAuthentifie } from "../auth/decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ContenusModule } from "../contenus/contenus.module";
import { AntivirusService } from "./antivirus.service";
import { ForumService } from "./forum.service";
import { ModerationService } from "./moderation.service";
import { PiecesJointesService } from "./pieces-jointes.service";
import { TermesService } from "./termes.service";

const idValide = new ParseUUIDPipe({ version: "4" });

@Catch(PayloadTooLargeException)
class FiltreTaillePieceJointe implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.PAYLOAD_TOO_LARGE)
      .json({ statusCode: 413, message: "Le fichier ne doit pas dépasser 5 Mo." });
  }
}

// Forum d'entraide : élèves, professeurs et administration, sous réserve des conditions du compte
// (email confirmé, accord parental pour les moins de 15 ans), vérifiées par ForumService.
@Roles("ELEVE", "PROFESSEUR", "ADMIN")
@Controller("forum")
export class ForumController {
  constructor(
    private readonly forum: ForumService,
    private readonly piecesJointes: PiecesJointesService,
  ) {}

  @Get("etat")
  etat(@CurrentUser() utilisateur: UtilisateurAuthentifie): Promise<EtatForum> {
    return this.forum.etat(utilisateur.id);
  }

  @Put("pseudonyme")
  pseudonyme(
    @Body(new ZodValidationPipe(pseudonymeForumSchema)) dto: z.infer<typeof pseudonymeForumSchema>,
    @CurrentUser() utilisateur: UtilisateurAuthentifie,
  ): Promise<EtatForum> {
    return this.forum.definirPseudonyme(utilisateur.id, dto.pseudonyme);
  }

  @Get("niveaux/:niveau/:matiere")
  page(
    @Param("niveau") niveau: string,
    @Param("matiere") matiere: string,
    @CurrentUser() utilisateur: UtilisateurAuthentifie,
  ): Promise<PageForum> {
    return this.forum.page(utilisateur.id, niveau, matiere);
  }

  @Post("sujets")
  creerSujet(
    @Body(new ZodValidationPipe(creerSujetSchema)) dto: CreerSujetDto,
    @CurrentUser() utilisateur: UtilisateurAuthentifie,
  ): Promise<SujetForumDetail> {
    return this.forum.creerSujet(utilisateur.id, dto);
  }

  @Get("sujets/:id")
  sujet(@Param("id", idValide) id: string, @CurrentUser() utilisateur: UtilisateurAuthentifie): Promise<SujetForumDetail> {
    return this.forum.sujet(utilisateur.id, id);
  }

  @Post("sujets/:id/messages")
  repondre(
    @Param("id", idValide) id: string,
    @Body(new ZodValidationPipe(repondreSchema)) dto: RepondreDto,
    @CurrentUser() utilisateur: UtilisateurAuthentifie,
  ): Promise<SujetForumDetail> {
    return this.forum.repondre(utilisateur.id, id, dto);
  }

  @Post("messages/:id/signaler")
  @HttpCode(HttpStatus.OK)
  signaler(
    @Param("id", idValide) id: string,
    @Body(new ZodValidationPipe(signalementSchema)) dto: SignalementDto,
    @CurrentUser() utilisateur: UtilisateurAuthentifie,
  ): Promise<{ masque: boolean }> {
    return this.forum.signaler(utilisateur.id, id, dto.motif);
  }

  @Post("pieces-jointes")
  @UseFilters(FiltreTaillePieceJointe)
  @UseInterceptors(FileInterceptor("fichier", { limits: { fileSize: TAILLE_MAX_PIECE_JOINTE, files: 1 } }))
  async televerser(
    @UploadedFile() fichier: Express.Multer.File | undefined,
    @CurrentUser() utilisateur: UtilisateurAuthentifie,
  ): Promise<PieceJointePublique> {
    if (!fichier) throw new BadRequestException("Aucun fichier reçu (champ « fichier »).");
    // Seuls les comptes ayant accès au forum peuvent téléverser (même règle que pour publier).
    const etat = await this.forum.etat(utilisateur.id);
    if (!etat.acces) throw new ForbiddenException(etat.raison);
    // Multer décode le nom en latin1 : on le relit en UTF-8 (accents des noms de fichiers).
    const nom = Buffer.from(fichier.originalname, "latin1").toString("utf8");
    return this.piecesJointes.televerser({ octets: fichier.buffer, nom }, utilisateur.id);
  }

  @Get("pieces-jointes/:id")
  async piece(
    @Param("id", idValide) id: string,
    @CurrentUser() utilisateur: UtilisateurAuthentifie,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const piece = await this.piecesJointes.lire(id, utilisateur);
    // Images affichées, PDF toujours téléchargés (jamais exécutés dans la page) ; aucun script possible.
    const disposition = piece.type === "application/pdf" ? "attachment" : "inline";
    res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(piece.nom)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Cache-Control", "private, max-age=3600");
    return new StreamableFile(piece.corps, { type: piece.type, length: piece.corps.length });
  }
}

@Roles("ADMIN")
@Controller("admin/moderation")
export class ModerationController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly termes: TermesService,
  ) {}

  @Get()
  file(): Promise<ElementModeration[]> {
    return this.moderation.file();
  }

  @Post("messages/:id/restaurer")
  @HttpCode(HttpStatus.NO_CONTENT)
  restaurer(@Param("id", idValide) id: string): Promise<void> {
    return this.moderation.restaurer(id);
  }

  @Delete("messages/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  supprimer(@Param("id", idValide) id: string): Promise<void> {
    return this.moderation.supprimer(id);
  }

  @Delete("sujets/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  supprimerSujet(@Param("id", idValide) id: string): Promise<void> {
    return this.moderation.supprimerSujet(id);
  }

  @Get("termes")
  listerTermes(): Promise<TermeInterditDto[]> {
    return this.termes.lister();
  }

  @Post("termes")
  ajouterTerme(@Body(new ZodValidationPipe(termeInterditSchema)) dto: z.infer<typeof termeInterditSchema>): Promise<TermeInterditDto> {
    return this.termes.ajouter(dto.terme);
  }

  @Delete("termes/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  retirerTerme(@Param("id", idValide) id: string): Promise<void> {
    return this.termes.retirer(id);
  }
}

@Module({
  imports: [ContenusModule],
  controllers: [ForumController, ModerationController],
  providers: [ForumService, ModerationService, PiecesJointesService, TermesService, AntivirusService],
  exports: [AntivirusService],
})
export class ForumModule {}
