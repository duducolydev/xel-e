import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Roles } from "../auth/decorators";
import type { Env } from "../config/env";
import { MailService } from "../mail/mail.service";
import { emailProfesseurValide } from "../mail/templates";
import { PrismaService } from "../prisma/prisma.service";

export interface ProfesseurEnAttente {
  id: string;
  nomComplet: string;
  email: string | null;
  createdAt: Date;
}

@Injectable()
export class AdminService {
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get("APP_URL", { infer: true });
  }

  professeursEnAttente(): Promise<ProfesseurEnAttente[]> {
    return this.prisma.user.findMany({
      where: { role: "PROFESSEUR", statutCompte: "EN_ATTENTE_VALIDATION", deletedAt: null },
      select: { id: true, nomComplet: true, email: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async validerProfesseur(id: string): Promise<void> {
    const { count } = await this.prisma.user.updateMany({
      where: { id, role: "PROFESSEUR", statutCompte: "EN_ATTENTE_VALIDATION", deletedAt: null },
      data: { statutCompte: "ACTIF" },
    });
    if (count === 0) throw new NotFoundException("Aucun professeur en attente avec cet identifiant.");

    const prof = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (prof.email) {
      await this.mail.envoyer(emailProfesseurValide(prof.email, prof.nomComplet, `${this.appUrl}/connexion`));
    }
  }
}

@Roles("ADMIN")
@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("professeurs/en-attente")
  professeursEnAttente(): Promise<ProfesseurEnAttente[]> {
    return this.admin.professeursEnAttente();
  }

  @Post("professeurs/:id/valider")
  @HttpCode(HttpStatus.NO_CONTENT)
  validerProfesseur(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string): Promise<void> {
    return this.admin.validerProfesseur(id);
  }
}
