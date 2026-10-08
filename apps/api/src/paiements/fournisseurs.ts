import { randomUUID } from "node:crypto";
import { egalConstant, verifierSignature } from "./regles";

export type CodeFournisseur = "WAVE" | "ORANGE_MONEY" | "SIMULE";
export type StatutDistant = "CONFIRME" | "ECHOUE" | "EN_ATTENTE";

export interface DemandeCheckout {
  referenceInterne: string;
  montant: number;
  description: string;
  urlRetour: string;
  urlAnnulation: string;
  urlNotification: string;
}

export interface Checkout {
  refExterne: string;
  urlPaiement: string;
  // Secret propre au paiement, renvoyé par le fournisseur dans sa notification (Orange Money).
  jetonNotification?: string;
}

export interface WebhookLu {
  idEvenement: string;
  type: string;
  statut: StatutDistant;
  refExterne?: string;
  referenceInterne?: string;
  jetonNotification?: string;
  montant?: number;
}

export class SignatureInvalide extends Error {
  constructor() {
    super("Signature du webhook invalide.");
  }
}

// Interface commune Wave / Orange Money / simulateur : checkout, vérification, lecture du webhook.
export interface PaymentProvider {
  readonly code: CodeFournisseur;
  readonly libelle: string;
  creerCheckout(demande: DemandeCheckout): Promise<Checkout>;
  verifier(paiement: { refExterne: string; referenceInterne: string; montant: number }): Promise<StatutDistant>;
  // Lève SignatureInvalide si la requête n'est pas authentique ; ne touche pas à la base.
  lireWebhook(corpsBrut: string, entetes: Record<string, string | undefined>, requete: Record<string, string | undefined>): WebhookLu;
}

type Requete = typeof fetch;

async function json(reponse: Response, contexte: string): Promise<Record<string, unknown>> {
  if (!reponse.ok) throw new Error(`${contexte} : réponse ${reponse.status}`);
  return (await reponse.json()) as Record<string, unknown>;
}

// --- Wave (Checkout API) — d'après la documentation publique, à valider en sandbox ---
// Session : POST /v1/checkout/sessions ; état : GET /v1/checkout/sessions/:id ;
// webhook signé « Wave-Signature: t=…,v1=HMAC-SHA256(secret, t + corps) ».
export class FournisseurWave implements PaymentProvider {
  readonly code = "WAVE";
  readonly libelle = "Wave";

  constructor(
    private readonly config: { cleApi: string; secretWebhook: string; url: string },
    private readonly requete: Requete = fetch,
    private readonly horloge: () => Date = () => new Date(),
  ) {}

  async creerCheckout(demande: DemandeCheckout): Promise<Checkout> {
    const reponse = await this.requete(`${this.config.url}/v1/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.cleApi}`,
        "Content-Type": "application/json",
        "Idempotency-Key": demande.referenceInterne,
      },
      body: JSON.stringify({
        amount: String(demande.montant),
        currency: "XOF",
        client_reference: demande.referenceInterne,
        success_url: demande.urlRetour,
        error_url: demande.urlAnnulation,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const session = await json(reponse, "Wave (création de session)");
    return { refExterne: String(session.id), urlPaiement: String(session.wave_launch_url) };
  }

  async verifier(paiement: { refExterne: string; montant: number }): Promise<StatutDistant> {
    const reponse = await this.requete(`${this.config.url}/v1/checkout/sessions/${encodeURIComponent(paiement.refExterne)}`, {
      headers: { Authorization: `Bearer ${this.config.cleApi}` },
      signal: AbortSignal.timeout(15_000),
    });
    const session = await json(reponse, "Wave (état de session)");
    if (session.payment_status === "succeeded") {
      return Number(session.amount) === paiement.montant ? "CONFIRME" : "ECHOUE";
    }
    if (session.checkout_status === "expired" || session.payment_status === "cancelled") return "ECHOUE";
    return "EN_ATTENTE";
  }

  lireWebhook(corpsBrut: string, entetes: Record<string, string | undefined>): WebhookLu {
    if (!verifierSignature(entetes["wave-signature"], corpsBrut, this.config.secretWebhook, this.horloge())) throw new SignatureInvalide();
    const evenement = JSON.parse(corpsBrut) as { id: string; type: string; data: Record<string, unknown> };
    const statut: StatutDistant =
      evenement.type === "checkout.session.completed" && evenement.data.payment_status === "succeeded"
        ? "CONFIRME"
        : evenement.type === "checkout.session.payment_failed"
          ? "ECHOUE"
          : "EN_ATTENTE";
    return {
      idEvenement: evenement.id,
      type: evenement.type,
      statut,
      refExterne: String(evenement.data.id),
      referenceInterne: evenement.data.client_reference ? String(evenement.data.client_reference) : undefined,
      montant: evenement.data.amount !== undefined ? Number(evenement.data.amount) : undefined,
    };
  }
}

// --- Orange Money Web Payment (Orange Developer) — d'après la documentation publique, à valider ---
// Jeton OAuth2 (client credentials), POST {chemin}/webpayment → pay_token, payment_url, notif_token ;
// la notification (notif_url) renvoie status + notif_token, comparé au jeton enregistré pour le paiement.
// L'URL de notification porte en plus notre secret (?cle=…), vérifié avant toute lecture.
export class FournisseurOrangeMoney implements PaymentProvider {
  readonly code = "ORANGE_MONEY";
  readonly libelle = "Orange Money";
  private jeton?: { valeur: string; expireLe: number };

  constructor(
    private readonly config: { cleApi: string; cleMarchand: string; secretWebhook: string; url: string; chemin: string; devise: string },
    private readonly requete: Requete = fetch,
  ) {}

  private async jetonAcces(): Promise<string> {
    if (this.jeton && this.jeton.expireLe > Date.now()) return this.jeton.valeur;
    const reponse = await this.requete(`${this.config.url}/oauth/v3/token`, {
      method: "POST",
      headers: { Authorization: this.config.cleApi, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
    });
    const donnees = await json(reponse, "Orange Money (jeton)");
    this.jeton = { valeur: String(donnees.access_token), expireLe: Date.now() + (Number(donnees.expires_in) - 60) * 1000 };
    return this.jeton.valeur;
  }

  async creerCheckout(demande: DemandeCheckout): Promise<Checkout> {
    const reponse = await this.requete(`${this.config.url}${this.config.chemin}/webpayment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.jetonAcces()}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_key: this.config.cleMarchand,
        currency: this.config.devise,
        order_id: demande.referenceInterne,
        amount: demande.montant,
        return_url: demande.urlRetour,
        cancel_url: demande.urlAnnulation,
        notif_url: `${demande.urlNotification}?cle=${encodeURIComponent(this.config.secretWebhook)}`,
        lang: "fr",
        reference: demande.description,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const paiement = await json(reponse, "Orange Money (paiement)");
    return { refExterne: String(paiement.pay_token), urlPaiement: String(paiement.payment_url), jetonNotification: String(paiement.notif_token) };
  }

  async verifier(paiement: { refExterne: string; referenceInterne: string; montant: number }): Promise<StatutDistant> {
    const reponse = await this.requete(`${this.config.url}${this.config.chemin}/transactionstatus`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.jetonAcces()}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ order_id: paiement.referenceInterne, amount: paiement.montant, pay_token: paiement.refExterne }),
      signal: AbortSignal.timeout(15_000),
    });
    const etat = await json(reponse, "Orange Money (état)");
    if (etat.status === "SUCCESS") return "CONFIRME";
    if (etat.status === "FAILED" || etat.status === "EXPIRED") return "ECHOUE";
    return "EN_ATTENTE";
  }

  lireWebhook(corpsBrut: string, _entetes: Record<string, string | undefined>, requete: Record<string, string | undefined>): WebhookLu {
    if (!this.config.secretWebhook || !egalConstant(requete.cle ?? "", this.config.secretWebhook)) throw new SignatureInvalide();
    const notification = JSON.parse(corpsBrut) as { status?: string; notif_token?: string; txnid?: string };
    if (!notification.notif_token) throw new SignatureInvalide();
    const statut: StatutDistant = notification.status === "SUCCESS" ? "CONFIRME" : notification.status === "FAILED" ? "ECHOUE" : "EN_ATTENTE";
    return {
      idEvenement: notification.txnid ?? `${notification.notif_token}:${notification.status}`,
      type: `notification.${String(notification.status ?? "inconnu").toLowerCase()}`,
      statut,
      jetonNotification: notification.notif_token,
    };
  }
}

// --- Simulateur (développement et tests) ---
// Le « checkout » ouvre une page de Xel-E où l'on choisit de payer ou de refuser ; le simulateur
// fabrique alors un webhook signé exactement comme ceux de Wave, traité par le même chemin.
export class FournisseurSimule implements PaymentProvider {
  readonly code = "SIMULE";
  readonly libelle = "Paiement simulé (test)";

  constructor(
    private readonly config: { secret: string; urlSite: string },
    private readonly horloge: () => Date = () => new Date(),
  ) {}

  async creerCheckout(_demande: DemandeCheckout): Promise<Checkout> {
    const refExterne = `sim_${randomUUID()}`;
    return { refExterne, urlPaiement: `${this.config.urlSite}/paiement/simulateur?ref=${encodeURIComponent(refExterne)}` };
  }

  async verifier(): Promise<StatutDistant> {
    return "EN_ATTENTE";
  }

  lireWebhook(corpsBrut: string, entetes: Record<string, string | undefined>): WebhookLu {
    if (!verifierSignature(entetes["x-signature-simulateur"], corpsBrut, this.config.secret, this.horloge())) throw new SignatureInvalide();
    const evenement = JSON.parse(corpsBrut) as { id: string; type: string; data: { id: string; montant: number } };
    return {
      idEvenement: evenement.id,
      type: evenement.type,
      statut: evenement.type === "paiement.reussi" ? "CONFIRME" : "ECHOUE",
      refExterne: evenement.data.id,
      montant: evenement.data.montant,
    };
  }
}
