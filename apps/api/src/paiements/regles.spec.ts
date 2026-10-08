import { describe, expect, it } from "vitest";
import {
  ajouterMois,
  doitExpirer,
  doitRelancer,
  etatPremium,
  numeroRecu,
  prochainePeriode,
  seChevauchent,
  signerWebhook,
  verifierSignature,
  type Periode,
} from "./regles";

const D = (iso: string) => new Date(iso);
const periode = (debut: string, fin: string, statut: Periode["statut"] = "ACTIF"): Periode & { relanceLe: Date | null } => ({
  statut,
  debutLe: D(debut),
  expireLe: D(fin),
  relanceLe: null,
});

describe("durée des périodes", () => {
  it("ajoute des mois calendaires, en ramenant au dernier jour du mois", () => {
    expect(ajouterMois(D("2026-10-08T10:00:00Z"), 1).toISOString()).toBe("2026-11-08T10:00:00.000Z");
    expect(ajouterMois(D("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(ajouterMois(D("2028-01-31T10:00:00Z"), 1).toISOString()).toBe("2028-02-29T10:00:00.000Z");
    expect(ajouterMois(D("2026-10-08T10:00:00Z"), 12).toISOString()).toBe("2027-10-08T10:00:00.000Z");
    expect(ajouterMois(D("2026-12-15T00:00:00Z"), 1).toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });
});

describe("transitions d'abonnement", () => {
  const maintenant = D("2026-10-08T10:00:00Z");

  it("premier paiement : la période commence maintenant", () => {
    expect(prochainePeriode([], maintenant, 1)).toEqual({ debutLe: maintenant, expireLe: D("2026-11-08T10:00:00Z") });
  });

  it("actif → renouvelé avant l'échéance : la nouvelle période commence à la fin de l'actuelle (aucun jour perdu)", () => {
    const actuelle = periode("2026-09-20T00:00:00Z", "2026-10-20T00:00:00Z");

    const suivante = prochainePeriode([actuelle], maintenant, 1);

    expect(suivante).toEqual({ debutLe: D("2026-10-20T00:00:00Z"), expireLe: D("2026-11-20T00:00:00Z") });
    expect(seChevauchent(actuelle, suivante)).toBe(false);
  });

  it("deux renouvellements anticipés s'enchaînent sans chevauchement", () => {
    const actuelle = periode("2026-09-20T00:00:00Z", "2026-10-20T00:00:00Z");
    const deuxieme = { statut: "ACTIF" as const, ...prochainePeriode([actuelle], maintenant, 1) };
    const troisieme = prochainePeriode([actuelle, deuxieme], maintenant, 12);

    expect(troisieme).toEqual({ debutLe: D("2026-11-20T00:00:00Z"), expireLe: D("2027-11-20T00:00:00Z") });
    expect([seChevauchent(actuelle, deuxieme), seChevauchent(deuxieme, troisieme), seChevauchent(actuelle, troisieme)]).toEqual([false, false, false]);
  });

  it("actif → expiré → renouvelé : après l'expiration, la nouvelle période repart de maintenant", () => {
    const passee = periode("2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z");

    expect(doitExpirer(passee, maintenant)).toBe(true);
    expect(prochainePeriode([{ ...passee, statut: "EXPIRE" }], maintenant, 1).debutLe).toEqual(maintenant);
  });

  it("une période annulée ou déjà expirée ne repousse pas le début", () => {
    const annulee = periode("2026-10-01T00:00:00Z", "2026-12-01T00:00:00Z", "ANNULE");
    expect(prochainePeriode([annulee], maintenant, 1).debutLe).toEqual(maintenant);
  });

  it("détecte les chevauchements", () => {
    expect(seChevauchent(periode("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z"), periode("2026-10-15T00:00:00Z", "2026-11-15T00:00:00Z"))).toBe(true);
    expect(seChevauchent(periode("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z"), periode("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z"))).toBe(false);
  });

  it("n'expire que les périodes actives terminées", () => {
    expect(doitExpirer(periode("2026-09-08T10:00:00Z", "2026-10-08T10:00:00Z"), maintenant)).toBe(true);
    expect(doitExpirer(periode("2026-09-08T10:00:00Z", "2026-10-08T10:00:01Z"), maintenant)).toBe(false);
    expect(doitExpirer(periode("2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z", "EXPIRE"), maintenant)).toBe(false);
  });
});

describe("état Premium", () => {
  const maintenant = D("2026-10-08T10:00:00Z");

  it("actif jusqu'à la fin de la chaîne de périodes", () => {
    const etat = etatPremium(
      [periode("2026-09-20T00:00:00Z", "2026-10-20T00:00:00Z"), periode("2026-10-20T00:00:00Z", "2026-11-20T00:00:00Z")],
      maintenant,
    );
    expect(etat).toEqual({ actif: true, jusquau: D("2026-11-20T00:00:00Z"), aRenouveler: false });
  });

  it("à renouveler dans les 3 derniers jours", () => {
    expect(etatPremium([periode("2026-09-10T00:00:00Z", "2026-10-10T00:00:00Z")], maintenant).aRenouveler).toBe(true);
  });

  it("expiré : inactif, avec la date de fin pour un message clair", () => {
    expect(etatPremium([periode("2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z", "EXPIRE")], maintenant)).toEqual({
      actif: false,
      jusquau: D("2026-09-01T00:00:00Z"),
      aRenouveler: false,
    });
    expect(etatPremium([], maintenant)).toEqual({ actif: false, jusquau: null, aRenouveler: false });
  });

  it("une période future seule (achetée d'avance) ne donne pas accès avant son début", () => {
    expect(etatPremium([periode("2026-10-20T00:00:00Z", "2026-11-20T00:00:00Z")], maintenant).actif).toBe(false);
  });
});

describe("relance J-3", () => {
  const maintenant = D("2026-10-08T10:00:00Z");

  it("relance une période qui se termine dans 3 jours ou moins, une seule fois", () => {
    const fin = periode("2026-09-10T12:00:00Z", "2026-10-10T12:00:00Z");
    expect(doitRelancer(fin, [fin], maintenant)).toBe(true);
    expect(doitRelancer({ ...fin, relanceLe: maintenant }, [fin], maintenant)).toBe(false);
  });

  it("pas de relance trop tôt, ni après l'échéance", () => {
    const lointaine = periode("2026-09-20T00:00:00Z", "2026-10-20T00:00:00Z");
    expect(doitRelancer(lointaine, [lointaine], maintenant)).toBe(false);
    const finie = periode("2026-09-01T00:00:00Z", "2026-10-08T09:00:00Z");
    expect(doitRelancer(finie, [finie], maintenant)).toBe(false);
  });

  it("pas de relance si l'abonnement est déjà renouvelé", () => {
    const fin = periode("2026-09-10T12:00:00Z", "2026-10-10T12:00:00Z");
    const suivante = periode("2026-10-10T12:00:00Z", "2026-11-10T12:00:00Z");
    expect(doitRelancer(fin, [fin, suivante], maintenant)).toBe(false);
  });
});

describe("reçus", () => {
  it("numérotation continue par année", () => {
    expect(numeroRecu(2026, 42)).toBe("XE-2026-000042");
  });
});

describe("signature des webhooks", () => {
  const secret = "secret-de-webhook";
  const corps = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const maintenant = D("2026-10-08T10:00:00Z");
  const t = Math.floor(maintenant.getTime() / 1000);

  it("accepte une signature valide et récente", () => {
    expect(verifierSignature(signerWebhook(secret, t, corps), corps, secret, maintenant)).toBe(true);
  });

  it.each([
    ["absente", undefined],
    ["mal formée", "n'importe quoi"],
    ["calculée avec un autre secret", signerWebhook("autre-secret", t, corps)],
    ["sur un autre corps (corps modifié)", signerWebhook(secret, t, `${corps} `)],
    ["trop ancienne (rejeu)", signerWebhook(secret, t - 301, corps)],
  ])("refuse une signature %s", (_cas, entete) => {
    expect(verifierSignature(entete, corps, secret, maintenant)).toBe(false);
  });

  it("refuse tout si aucun secret n'est configuré", () => {
    expect(verifierSignature(signerWebhook("", t, corps), corps, "", maintenant)).toBe(false);
  });

  it("accepte plusieurs signatures (rotation du secret)", () => {
    const ancienne = signerWebhook("ancien", t, corps).split(",")[1];
    expect(verifierSignature(`${signerWebhook(secret, t, corps)},${ancienne}`, corps, secret, maintenant)).toBe(true);
  });
});

describe("offres de départ", () => {
  it("la migration « paiements » insère exactement les offres du seed (production sans seed)", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { PLANS_INITIAUX } = await import("./plans-initiaux");
    const dossier = join(__dirname, "..", "..", "prisma", "migrations");
    const sql = readFileSync(join(dossier, readdirSync(dossier).find((nom) => nom.endsWith("_paiements"))!, "migration.sql"), "utf8");
    for (const plan of PLANS_INITIAUX) expect(sql).toContain(`('${plan.id}', '${plan.code}', '${plan.libelle}', ${plan.prixFcfa}, ${plan.dureeMois},`);
  });
});
