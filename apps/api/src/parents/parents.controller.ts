import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  codeLiaisonSchema,
  declencherResumeSchema,
  desinscriptionSchema,
  preferencesParentSchema,
  type CodeLiaisonGenere,
  type EnfantLie,
  type NotificationEleve,
  type PreferencesParent,
  type PreferencesParentDto,
  type TableauEnfant,
} from "@xel-e/shared";
import type { z } from "zod";
import { CurrentUser, Public, Roles, type UtilisateurAuthentifie } from "../auth/decorators";
import { LimiterDebit } from "../auth/rate-limit";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { Env } from "../config/env";
import { MailModule } from "../mail/mail.module";
import { NotificationsService } from "../notifications/notifications.service";
import { ActiviteService } from "./activite.service";
import { CanalHttp, CanalMock, NOTIFICATION_CHANNEL } from "./canaux";
import { FileResumes } from "./file-resumes";
import { LiaisonService } from "./liaison.service";
import { PreferencesService } from "./preferences.service";
import { ResumesService } from "./resumes.service";
import { SuiviService } from "./suivi.service";

const idValide = new ParseUUIDPipe({ version: "4" });

export interface EspaceParent {
  enfants: EnfantLie[];
  notifications: NotificationEleve[];
  notificationsNonLues: number;
  preferences: PreferencesParent;
}

@Controller()
export class ParentsController {
  constructor(
    private readonly liaison: LiaisonService,
    private readonly suivi: SuiviService,
    private readonly preferences: PreferencesService,
    private readonly activite: ActiviteService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- Élève ---

  @Roles("ELEVE")
  @Post("parents/code")
  genererCode(@CurrentUser() eleve: UtilisateurAuthentifie): Promise<CodeLiaisonGenere> {
    return this.liaison.generer(eleve.id);
  }

  @Roles("ELEVE")
  @Get("parents/mes-parents")
  async mesParents(@CurrentUser() eleve: UtilisateurAuthentifie): Promise<{ nombre: number }> {
    return { nombre: await this.liaison.nombreDeParents(eleve.id) };
  }

  @Roles("ELEVE")
  @Post("activite/presence")
  @HttpCode(HttpStatus.NO_CONTENT)
  presence(@CurrentUser() eleve: UtilisateurAuthentifie): Promise<void> {
    return this.activite.signalerPresence(eleve.id);
  }

  // --- Parent ---

  @Roles("PARENT")
  @Get("parents")
  async espace(@CurrentUser() parent: UtilisateurAuthentifie): Promise<EspaceParent> {
    const [enfants, { notifications, nonLues }, preferences] = await Promise.all([
      this.liaison.enfants(parent.id),
      this.notifications.recentes(parent.id),
      this.preferences.lire(parent.id),
    ]);
    return { enfants, notifications, notificationsNonLues: nonLues, preferences };
  }

  @Roles("PARENT")
  @Post("parents/liaison")
  @LimiterDebit({ nom: "liaison-parent", max: 20, fenetreSecondes: 15 * 60 })
  lier(
    @Body(new ZodValidationPipe(codeLiaisonSchema)) dto: z.infer<typeof codeLiaisonSchema>,
    @CurrentUser() parent: UtilisateurAuthentifie,
  ): Promise<EnfantLie> {
    return this.liaison.lier(parent.id, dto.code);
  }

  @Roles("PARENT")
  @Get("parents/enfants/:id")
  async tableau(@Param("id", idValide) id: string, @CurrentUser() parent: UtilisateurAuthentifie): Promise<TableauEnfant> {
    await this.liaison.verifierLien(parent.id, id);
    return this.suivi.tableau(id);
  }

  @Roles("PARENT")
  @Delete("parents/enfants/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  delier(@Param("id", idValide) id: string, @CurrentUser() parent: UtilisateurAuthentifie): Promise<void> {
    return this.liaison.delier(parent.id, id);
  }

  @Roles("PARENT")
  @Post("parents/enfants/:id/accord-parental")
  @HttpCode(HttpStatus.NO_CONTENT)
  accord(@Param("id", idValide) id: string, @CurrentUser() parent: UtilisateurAuthentifie): Promise<void> {
    return this.liaison.donnerAccord(parent.id, id);
  }

  @Roles("PARENT")
  @Put("parents/preferences")
  modifierPreferences(
    @Body(new ZodValidationPipe(preferencesParentSchema)) dto: PreferencesParentDto,
    @CurrentUser() parent: UtilisateurAuthentifie,
  ): Promise<PreferencesParent> {
    return this.preferences.modifier(parent.id, dto);
  }

  // Lien de désinscription des emails : sans connexion, protégé par la signature du jeton.
  @Public()
  @Post("parents/desinscription")
  @HttpCode(HttpStatus.NO_CONTENT)
  @LimiterDebit({ nom: "desinscription", max: 30, fenetreSecondes: 15 * 60 })
  desinscrire(@Body(new ZodValidationPipe(desinscriptionSchema)) dto: z.infer<typeof desinscriptionSchema>): Promise<void> {
    return this.preferences.desinscrire(dto.token);
  }
}

@Roles("ADMIN")
@Controller("admin")
export class AdminParentsController {
  constructor(
    private readonly liaison: LiaisonService,
    private readonly file: FileResumes,
  ) {}

  @Post("eleves/:id/code-liaison")
  genererCode(@Param("id", idValide) id: string): Promise<CodeLiaisonGenere> {
    return this.liaison.generer(id);
  }

  // Déclenchement manuel du résumé (tests, rattrapage après incident).
  @Post("resumes/declencher")
  @HttpCode(HttpStatus.ACCEPTED)
  async declencher(@Body(new ZodValidationPipe(declencherResumeSchema)) dto: z.infer<typeof declencherResumeSchema>): Promise<{ jobId: string }> {
    return { jobId: await this.file.declencher(dto.type) };
  }
}

@Module({
  imports: [MailModule],
  controllers: [ParentsController, AdminParentsController],
  providers: [
    LiaisonService,
    SuiviService,
    PreferencesService,
    ActiviteService,
    ResumesService,
    FileResumes,
    CanalMock,
    {
      provide: NOTIFICATION_CHANNEL,
      inject: [ConfigService, CanalMock],
      useFactory: (config: ConfigService<Env, true>, mock: CanalMock) =>
        config.get("NOTIF_PROVIDER", { infer: true }) === "http"
          ? new CanalHttp(config.get("NOTIF_HTTP_URL", { infer: true }) as string, config.get("NOTIF_HTTP_TOKEN", { infer: true }))
          : mock,
    },
  ],
  exports: [FileResumes, CanalMock],
})
export class ParentsModule {}
