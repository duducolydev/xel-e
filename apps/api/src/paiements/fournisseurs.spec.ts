import { describe, expect, it, vi } from "vitest";
import { FournisseurOrangeMoney, FournisseurSimule, FournisseurWave, SignatureInvalide, type DemandeCheckout } from "./fournisseurs";
import { gabaritRecu } from "./recu";
import { signerWebhook } from "./regles";

const DEMANDE: DemandeCheckout = {
  referenceInterne: "XE-123",
  montant: 1500,
  description: "Xel-E Premium mensuel",
  urlRetour: "https://xele.sn/abonnement/retour?paiement=p1",
  urlAnnulation: "https://xele.sn/abonnement/retour?paiement=p1&annule=1",
  urlNotification: "https://xele.sn/api/webhooks/orange-money",
};
const reponse = (corps: unknown, status = 200) => ({ ok: status < 300, status, json: async () => corps }) as Response;
const MAINTENANT = new Date("2026-10-08T10:00:00Z");
const T = Math.floor(MAINTENANT.getTime() / 1000);

describe("Wave (d'après la documentation publique)", () => {
  const config = { cleApi: "wave_sn_prod_cle", secretWebhook: "wave_sn_WHS_secret", url: "https://api.wave.com" };

  it("crée une session de paiement en XOF avec notre référence et une clé d'idempotence", async () => {
    const requete = vi.fn().mockResolvedValue(reponse({ id: "cos-18qq", wave_launch_url: "https://pay.wave.com/c/cos-18qq" }));
    const wave = new FournisseurWave(config, requete as unknown as typeof fetch);

    expect(await wave.creerCheckout(DEMANDE)).toEqual({ refExterne: "cos-18qq", urlPaiement: "https://pay.wave.com/c/cos-18qq" });
    const [url, init] = requete.mock.calls[0]!;
    expect(url).toBe("https://api.wave.com/v1/checkout/sessions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer wave_sn_prod_cle", "Idempotency-Key": "XE-123" });
    expect(JSON.parse(init.body)).toEqual({
      amount: "1500",
      currency: "XOF",
      client_reference: "XE-123",
      success_url: DEMANDE.urlRetour,
      error_url: DEMANDE.urlAnnulation,
    });
  });

  it("une erreur de l'API remonte (le paiement sera marqué en échec)", async () => {
    const wave = new FournisseurWave(config, vi.fn().mockResolvedValue(reponse({}, 401)) as unknown as typeof fetch);
    await expect(wave.creerCheckout(DEMANDE)).rejects.toThrow(/401/);
  });

  it.each([
    [{ payment_status: "succeeded", amount: "1500" }, "CONFIRME"],
    [{ payment_status: "succeeded", amount: "100" }, "ECHOUE"],
    [{ payment_status: "cancelled" }, "ECHOUE"],
    [{ checkout_status: "expired", payment_status: "processing" }, "ECHOUE"],
    [{ checkout_status: "open", payment_status: "processing" }, "EN_ATTENTE"],
  ])("vérifie l'état d'une session %j ⇒ %s", async (session, attendu) => {
    const wave = new FournisseurWave(config, vi.fn().mockResolvedValue(reponse(session)) as unknown as typeof fetch);
    expect(await wave.verifier({ refExterne: "cos-18qq", montant: 1500 })).toBe(attendu);
  });

  it("lit un webhook signé (Wave-Signature)", () => {
    const corps = JSON.stringify({
      id: "AE_ijzo7oGgrlM",
      type: "checkout.session.completed",
      data: { id: "cos-18qq", client_reference: "XE-123", payment_status: "succeeded", amount: "1500" },
    });
    const wave = new FournisseurWave(config, fetch, () => MAINTENANT);

    expect(wave.lireWebhook(corps, { "wave-signature": signerWebhook(config.secretWebhook, T, corps) })).toEqual({
      idEvenement: "AE_ijzo7oGgrlM",
      type: "checkout.session.completed",
      statut: "CONFIRME",
      refExterne: "cos-18qq",
      referenceInterne: "XE-123",
      montant: 1500,
    });
  });

  it("rejette un webhook mal signé et lit un échec de paiement", () => {
    const corps = JSON.stringify({ id: "AE_2", type: "checkout.session.payment_failed", data: { id: "cos-1" } });
    const wave = new FournisseurWave(config, fetch, () => MAINTENANT);

    expect(() => wave.lireWebhook(corps, { "wave-signature": signerWebhook("autre", T, corps) })).toThrow(SignatureInvalide);
    expect(wave.lireWebhook(corps, { "wave-signature": signerWebhook(config.secretWebhook, T, corps) })).toMatchObject({ statut: "ECHOUE", referenceInterne: undefined });
  });
});

describe("Orange Money Web Payment (d'après la documentation publique)", () => {
  const config = {
    cleApi: "Basic Y2xpZW50OnNlY3JldA==",
    cleMarchand: "marchand-123",
    secretWebhook: "secret-om",
    url: "https://api.orange.com",
    chemin: "/orange-money-webpay/dev/v1",
    devise: "OUV",
  };
  const jeton = reponse({ access_token: "jeton-om", expires_in: 7776000 });

  it("obtient un jeton OAuth puis crée le paiement ; l'URL de notification porte notre secret", async () => {
    const requete = vi
      .fn()
      .mockResolvedValueOnce(jeton)
      .mockResolvedValueOnce(reponse({ pay_token: "v1d5d6", payment_url: "https://webpayment.orange-money.com/payment/pay_token/v1d5d6", notif_token: "dd497bda" }, 201));
    const om = new FournisseurOrangeMoney(config, requete as unknown as typeof fetch);

    expect(await om.creerCheckout(DEMANDE)).toEqual({
      refExterne: "v1d5d6",
      urlPaiement: "https://webpayment.orange-money.com/payment/pay_token/v1d5d6",
      jetonNotification: "dd497bda",
    });
    expect(requete.mock.calls[0]![0]).toBe("https://api.orange.com/oauth/v3/token");
    expect(requete.mock.calls[0]![1].headers.Authorization).toBe("Basic Y2xpZW50OnNlY3JldA==");
    const corps = JSON.parse(requete.mock.calls[1]![1].body);
    expect(corps).toMatchObject({ merchant_key: "marchand-123", currency: "OUV", order_id: "XE-123", amount: 1500, lang: "fr" });
    expect(corps.notif_url).toBe("https://xele.sn/api/webhooks/orange-money?cle=secret-om");
  });

  it("réutilise le jeton OAuth tant qu'il est valable", async () => {
    const requete = vi.fn().mockResolvedValueOnce(jeton).mockResolvedValue(reponse({ status: "SUCCESS" }));
    const om = new FournisseurOrangeMoney(config, requete as unknown as typeof fetch);

    expect(await om.verifier({ refExterne: "v1d5d6", referenceInterne: "XE-123", montant: 1500 })).toBe("CONFIRME");
    await om.verifier({ refExterne: "v1d5d6", referenceInterne: "XE-123", montant: 1500 });
    expect(requete.mock.calls.filter((c) => String(c[0]).includes("oauth"))).toHaveLength(1);
  });

  it.each([
    ["FAILED", "ECHOUE"],
    ["EXPIRED", "ECHOUE"],
    ["INITIATED", "EN_ATTENTE"],
  ])("état %s ⇒ %s", async (status, attendu) => {
    const om = new FournisseurOrangeMoney(config, vi.fn().mockResolvedValueOnce(jeton).mockResolvedValue(reponse({ status })) as unknown as typeof fetch);
    expect(await om.verifier({ refExterne: "x", referenceInterne: "XE-1", montant: 1500 })).toBe(attendu);
  });

  it("lit une notification portant notre secret ; la refuse sans secret ou sans jeton", () => {
    const om = new FournisseurOrangeMoney(config, fetch);
    const corps = JSON.stringify({ status: "SUCCESS", notif_token: "dd497bda", txnid: "MP150709.1341.A00073" });

    expect(om.lireWebhook(corps, {}, { cle: "secret-om" })).toEqual({
      idEvenement: "MP150709.1341.A00073",
      type: "notification.success",
      statut: "CONFIRME",
      jetonNotification: "dd497bda",
    });
    expect(() => om.lireWebhook(corps, {}, { cle: "mauvais" })).toThrow(SignatureInvalide);
    expect(() => om.lireWebhook(corps, {}, {})).toThrow(SignatureInvalide);
    expect(() => om.lireWebhook(JSON.stringify({ status: "SUCCESS" }), {}, { cle: "secret-om" })).toThrow(SignatureInvalide);
    expect(om.lireWebhook(JSON.stringify({ status: "FAILED", notif_token: "t" }), {}, { cle: "secret-om" })).toMatchObject({ statut: "ECHOUE", idEvenement: "t:FAILED" });
  });
});

describe("simulateur de paiement", () => {
  const simule = new FournisseurSimule({ secret: "secret-du-simulateur-de-paiement", urlSite: "http://localhost:3010" }, () => MAINTENANT);

  it("le checkout renvoie vers la page du simulateur de Xel-E", async () => {
    const checkout = await simule.creerCheckout(DEMANDE);
    expect(checkout.urlPaiement).toBe(`http://localhost:3010/paiement/simulateur?ref=${checkout.refExterne}`);
    expect(await simule.verifier()).toBe("EN_ATTENTE");
  });

  it("exige la même signature que les vrais webhooks", () => {
    const corps = JSON.stringify({ id: "evt_1", type: "paiement.reussi", data: { id: "sim_1", montant: 1500 } });
    expect(simule.lireWebhook(corps, { "x-signature-simulateur": signerWebhook("secret-du-simulateur-de-paiement", T, corps) })).toMatchObject({
      statut: "CONFIRME",
      refExterne: "sim_1",
      montant: 1500,
    });
    expect(() => simule.lireWebhook(corps, {})).toThrow(SignatureInvalide);
  });
});

describe("reçu de paiement", () => {
  const html = gabaritRecu({
    numeroRecu: "XE-2026-000042",
    confirmeLe: new Date("2026-10-08T10:00:00Z"),
    montant: 15000,
    fournisseur: "WAVE",
    referenceInterne: "XE-abc",
    plan: { libelle: "Premium annuel" },
    payeur: { nomComplet: "Mame <script>Diop</script>", email: "mame@example.sn", identifiant: null },
    beneficiaire: { nomComplet: "Fatou Diop" },
    periode: { debutLe: new Date("2026-10-08T10:00:00Z"), expireLe: new Date("2027-10-08T10:00:00Z") },
  });

  it("contient numéro, montant, période, bénéficiaire et moyen de paiement", () => {
    expect(html).toContain("XE-2026-000042");
    expect(html).toContain("15 000 FCFA");
    expect(html).toContain("du 8 octobre 2026 au 8 octobre 2027");
    expect(html).toContain("Fatou Diop");
    expect(html).toContain("Wave");
  });

  it("échappe les valeurs saisies par les utilisateurs", () => {
    expect(html).not.toContain("<script>");
    expect(html).toContain("Mame &lt;script&gt;Diop&lt;/script&gt; (mame@example.sn)");
  });
});
