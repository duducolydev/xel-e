import { Injectable, Logger } from "@nestjs/common";

export type CanalExterne = "WHATSAPP" | "SMS";

// Fournisseur WhatsApp/SMS. Une erreur levée par `envoyer` déclenche une nouvelle tentative (backoff).
export interface NotificationChannel {
  readonly nom: string;
  envoyer(canal: CanalExterne, destinataire: string, message: string): Promise<void>;
}

export const NOTIFICATION_CHANNEL = Symbol("NOTIFICATION_CHANNEL");

export interface MessageEnvoye {
  canal: CanalExterne;
  destinataire: string;
  message: string;
}

// Développement et tests : garde les messages en mémoire (et les journalise), n'envoie rien.
// `programmerEchecs(n)` fait échouer les n prochains envois, pour éprouver les nouvelles tentatives.
@Injectable()
export class CanalMock implements NotificationChannel {
  readonly nom = "mock";
  readonly envoyes: MessageEnvoye[] = [];
  private echecsRestants = 0;
  private readonly logger = new Logger(CanalMock.name);

  get echecsEnAttente(): number {
    return this.echecsRestants;
  }

  programmerEchecs(nombre: number): void {
    this.echecsRestants = nombre;
  }

  async envoyer(canal: CanalExterne, destinataire: string, message: string): Promise<void> {
    if (this.echecsRestants > 0) {
      this.echecsRestants -= 1;
      throw new Error(`Échec simulé du canal ${canal}`);
    }
    this.envoyes.push({ canal, destinataire, message });
    this.logger.log(`[${canal}] → ${destinataire} : ${message}`);
  }
}

// Fournisseur réel générique : POST JSON vers une passerelle (configurée par NOTIF_HTTP_URL/TOKEN),
// en attendant le choix du fournisseur WhatsApp/SMS définitif.
export class CanalHttp implements NotificationChannel {
  readonly nom = "http";

  constructor(
    private readonly url: string,
    private readonly jeton: string | undefined,
    private readonly requete: typeof fetch = fetch,
  ) {}

  async envoyer(canal: CanalExterne, destinataire: string, message: string): Promise<void> {
    const reponse = await this.requete(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(this.jeton ? { Authorization: `Bearer ${this.jeton}` } : {}) },
      body: JSON.stringify({ canal: canal.toLowerCase(), destinataire, message }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!reponse.ok) throw new Error(`Passerelle ${canal} : réponse ${reponse.status}`);
  }
}
