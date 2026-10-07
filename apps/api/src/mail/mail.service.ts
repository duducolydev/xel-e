import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, Transporter } from "nodemailer";
import type { Env } from "../config/env";

export interface Email {
  destinataire: string;
  sujet: string;
  texte: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly expediteur: string;

  constructor(config: ConfigService<Env, true>) {
    this.transporter = createTransport({
      host: config.get("SMTP_HOST", { infer: true }),
      port: config.get("SMTP_PORT", { infer: true }),
      secure: false,
    });
    this.expediteur = config.get("MAIL_FROM", { infer: true });
  }

  // Un email non parti ne doit pas faire échouer l'action (inscription, etc.) : on journalise.
  async envoyer(email: Email): Promise<void> {
    try {
      await this.envoyerOuEchouer(email);
    } catch (error) {
      this.logger.error(`Échec d'envoi à ${email.destinataire} : ${(error as Error).message}`);
    }
  }

  // Pour les envois rejoués par une file (résumés) : l'échec remonte pour déclencher une nouvelle tentative.
  async envoyerOuEchouer(email: Email): Promise<void> {
    await this.transporter.sendMail({
      from: this.expediteur,
      to: email.destinataire,
      subject: email.sujet,
      text: email.texte,
    });
  }
}
