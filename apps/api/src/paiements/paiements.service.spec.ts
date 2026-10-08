import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { MailService } from "../mail/mail.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { FournisseurSimule, type CodeFournisseur, type PaymentProvider } from "./fournisseurs";
import { PaiementsService } from "./paiements.service";
import { signerWebhook } from "./regles";

const SECRET = "secret-du-simulateur-de-paiement";
const PLANS = [
  { id: "plan-m", code: "PREMIUM_MENSUEL", libelle: "Premium mensuel", prixFcfa: 1500, dureeMois: 1, actif: true, aConfirmer: true, ordre: 1 },
  { id: "plan-a", code: "PREMIUM_ANNUEL", libelle: "Premium annuel", prixFcfa: 15000, dureeMois: 12, actif: true, aConfirmer: true, ordre: 2 },
];

type Ligne = Record<string, unknown>;

// Fausse base en mémoire, suffisante pour le circuit de paiement.
function creerBase() {
  const paiements: Ligne[] = [];
  const abonnements: Ligne[] = [];
  const evenements: Ligne[] = [];
  const compteurs = new Map<number, number>();
  const liens = [{ parentId: "parent-1", enfantId: "eleve-1" }];
  const correspond = (ligne: Ligne, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([cle, valeur]) => {
      if (cle === "OR") return (valeur as Record<string, unknown>[]).some((w) => correspond(ligne, w));
      if (valeur && typeof valeur === "object" && !(valeur instanceof Date) && "lt" in (valeur as object)) return true;
      return ligne[cle] === valeur;
    });
  const delegues = {
    plan: {
      findFirst: vi.fn(async ({ where }: { where: Ligne }) => PLANS.find((p) => p.code === where.code && p.actif) ?? null),
      findMany: vi.fn(async () => PLANS),
    },
    parentLink: {
      findUnique: vi.fn(async ({ where }: { where: { parentId_enfantId: { parentId: string; enfantId: string } } }) =>
        liens.find((l) => l.parentId === where.parentId_enfantId.parentId && l.enfantId === where.parentId_enfantId.enfantId) ?? null,
      ),
    },
    paiement: {
      create: vi.fn(async ({ data }: { data: Ligne }) => {
        const ligne = { id: `paiement-${paiements.length + 1}`, statut: "EN_ATTENTE", createdAt: new Date(), confirmeLe: null, numeroRecu: null, abonnementId: null, refExterne: null, jetonNotification: null, ...data };
        paiements.push(ligne);
        return ligne;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Ligne }) => Object.assign(paiements.find((p) => p.id === where.id)!, data)),
      updateMany: vi.fn(async ({ where, data }: { where: Ligne; data: Ligne }) => {
        const cibles = paiements.filter((p) => correspond(p, where));
        cibles.forEach((p) => Object.assign(p, data));
        return { count: cibles.length };
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = paiements.find((x) => x.id === where.id)!;
        return { ...p, plan: PLANS.find((plan) => plan.id === p.planId) };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = paiements.find((x) => x.id === where.id);
        return p ? { ...p, plan: PLANS.find((plan) => plan.id === p.planId), beneficiaire: { nomComplet: "Fatou Diop" } } : null;
      }),
      findFirst: vi.fn(async ({ where }: { where: Ligne }) => paiements.find((p) => correspond(p, where)) ?? null),
      findMany: vi.fn(async () => []),
    },
    abonnement: {
      findMany: vi.fn(async ({ where }: { where: Ligne }) => abonnements.filter((a) => correspond(a, where))),
      create: vi.fn(async ({ data }: { data: Ligne }) => {
        const ligne = { id: `abonnement-${abonnements.length + 1}`, relanceLe: null, ...data };
        abonnements.push(ligne);
        return ligne;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Ligne; data: Ligne }) => {
        const cibles = abonnements.filter((a) => correspond(a, where));
        cibles.forEach((a) => Object.assign(a, data));
        return { count: cibles.length };
      }),
    },
    evenementPaiement: {
      create: vi.fn(async ({ data }: { data: Ligne }) => {
        if (evenements.some((e) => e.fournisseur === data.fournisseur && e.idEvenement === data.idEvenement)) {
          throw new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "5" });
        }
        const ligne = { id: `evenement-${evenements.length + 1}`, statut: "RECU", tentatives: 0, ...data };
        evenements.push(ligne);
        return ligne;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Ligne }) => {
        const evenement = evenements.find((e) => e.id === where.id)!;
        for (const [cle, valeur] of Object.entries(data)) {
          evenement[cle] = valeur && typeof valeur === "object" && "increment" in (valeur as object) ? Number(evenement[cle]) + 1 : valeur;
        }
        return evenement;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => evenements.find((e) => e.id === where.id)),
    },
    compteurRecu: {
      upsert: vi.fn(async ({ where }: { where: { annee: number } }) => {
        compteurs.set(where.annee, (compteurs.get(where.annee) ?? 0) + 1);
        return { annee: where.annee, valeur: compteurs.get(where.annee) };
      }),
    },
    user: { findUniqueOrThrow: vi.fn(async () => ({ id: "eleve-1", nomComplet: "Fatou Diop", email: "fatou@example.sn" })) },
    $queryRaw: vi.fn(async () => []),
  };
  const prisma = { ...delegues, $transaction: vi.fn(async (fn: (tx: typeof delegues) => Promise<unknown>) => fn(delegues)) };
  return { prisma, paiements, abonnements, evenements, delegues };
}

function creerService(fournisseurs?: Map<CodeFournisseur, PaymentProvider>) {
  const base = creerBase();
  const notifications = { notifier: vi.fn() };
  const mail = { envoyer: vi.fn() };
  const config = { get: () => "http://localhost:3010" } as unknown as ConfigService<Env, true>;
  const simule = new FournisseurSimule({ secret: SECRET, urlSite: "http://localhost:3010" });
  const service = new PaiementsService(
    base.prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    mail as unknown as MailService,
    config,
    fournisseurs ?? new Map<CodeFournisseur, PaymentProvider>([["SIMULE", simule]]),
  );
  const retraitement = { programmer: vi.fn() };
  service.brancherRetraitement(retraitement);
  return { service, notifications, mail, retraitement, ...base };
}

const ELEVE = { id: "eleve-1", role: "ELEVE" };
const PARENT = { id: "parent-1", role: "PARENT" };

function webhookSimule(ref: string, type = "paiement.reussi", id = "evt_1", montant = 1500) {
  const corps = JSON.stringify({ id, type, data: { id: ref, montant } });
  return { corps, entetes: { "x-signature-simulateur": signerWebhook(SECRET, Math.floor(Date.now() / 1000), corps) } };
}

describe("PaiementsService — création du paiement", () => {
  it("l'élève paie pour lui-même : paiement en attente et URL du fournisseur", async () => {
    const { service, paiements } = creerService();

    const { paiementId, urlPaiement } = await service.creer(ELEVE, { plan: "PREMIUM_MENSUEL", fournisseur: "SIMULE" });

    expect(urlPaiement).toMatch(/^http:\/\/localhost:3010\/paiement\/simulateur\?ref=sim_/);
    expect(paiements[0]).toMatchObject({ id: paiementId, payeurId: "eleve-1", beneficiaireId: "eleve-1", montant: 1500, statut: "EN_ATTENTE", fournisseur: "SIMULE" });
    expect(paiements[0]!.referenceInterne).toMatch(/^XE-/);
  });

  it("un parent paie pour un enfant lié, jamais pour un autre", async () => {
    const { service } = creerService();

    await expect(service.creer(PARENT, { plan: "PREMIUM_ANNUEL", fournisseur: "SIMULE", beneficiaireId: "eleve-1" })).resolves.toBeDefined();
    await expect(service.creer(PARENT, { plan: "PREMIUM_ANNUEL", fournisseur: "SIMULE", beneficiaireId: "eleve-2" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.creer(PARENT, { plan: "PREMIUM_ANNUEL", fournisseur: "SIMULE" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("un élève ne paie pas pour un autre ; les autres rôles ne souscrivent pas", async () => {
    const { service } = creerService();

    await expect(service.creer(ELEVE, { plan: "PREMIUM_MENSUEL", fournisseur: "SIMULE", beneficiaireId: "eleve-2" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.creer({ id: "prof", role: "PROFESSEUR" }, { plan: "PREMIUM_MENSUEL", fournisseur: "SIMULE" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuse une offre ou un moyen de paiement indisponible", async () => {
    const { service } = creerService();

    await expect(service.creer(ELEVE, { plan: "INCONNU", fournisseur: "SIMULE" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.creer(ELEVE, { plan: "PREMIUM_MENSUEL", fournisseur: "WAVE" })).rejects.toThrow(/moyen de paiement n'est pas disponible/);
  });

  it("fournisseur injoignable : paiement marqué en échec et message clair", async () => {
    const enPanne: PaymentProvider = {
      code: "WAVE",
      libelle: "Wave",
      creerCheckout: vi.fn().mockRejectedValue(new Error("délai dépassé")),
      verifier: vi.fn(),
      lireWebhook: vi.fn(),
    };
    const { service, paiements } = creerService(new Map([["WAVE", enPanne]]));

    await expect(service.creer(ELEVE, { plan: "PREMIUM_MENSUEL", fournisseur: "WAVE" })).rejects.toThrow(/Wave ne répond pas/);
    expect(paiements[0]!.statut).toBe("ECHOUE");
  });
});

describe("PaiementsService — webhooks", () => {
  let ctx: ReturnType<typeof creerService>;
  let ref: string;

  beforeEach(async () => {
    ctx = creerService();
    await ctx.service.creer(ELEVE, { plan: "PREMIUM_MENSUEL", fournisseur: "SIMULE" });
    ref = ctx.paiements[0]!.refExterne as string;
  });

  it("confirmation : paiement confirmé, période d'un mois, reçu numéroté, notification", async () => {
    const { corps, entetes } = webhookSimule(ref);

    expect(await ctx.service.recevoirWebhook("SIMULE", corps, entetes, {})).toEqual({ statut: "traite" });

    expect(ctx.paiements[0]).toMatchObject({ statut: "CONFIRME", numeroRecu: expect.stringMatching(/^XE-\d{4}-000001$/), abonnementId: "abonnement-1" });
    expect(ctx.abonnements).toHaveLength(1);
    expect(ctx.abonnements[0]).toMatchObject({ utilisateurId: "eleve-1", plan: "PREMIUM_MENSUEL", statut: "ACTIF" });
    expect(ctx.notifications.notifier).toHaveBeenCalledWith(["eleve-1"], "ABONNEMENT", expect.stringContaining("Ton accès Premium est activé"));
    expect(ctx.evenements[0]).toMatchObject({ statut: "TRAITE" });
  });

  it("idempotence : le même événement rejoué n'est pas retraité (un seul paiement, une seule période)", async () => {
    const { corps, entetes } = webhookSimule(ref);

    await ctx.service.recevoirWebhook("SIMULE", corps, entetes, {});
    expect(await ctx.service.recevoirWebhook("SIMULE", corps, entetes, {})).toEqual({ statut: "deja-traite" });

    expect(ctx.abonnements).toHaveLength(1);
    expect(ctx.paiements.filter((p) => p.statut === "CONFIRME")).toHaveLength(1);
  });

  it("idempotence : même ref_externe traitée deux fois (deux événements distincts) ⇒ un seul paiement", async () => {
    await ctx.service.recevoirWebhook("SIMULE", webhookSimule(ref, "paiement.reussi", "evt_1").corps, webhookSimule(ref, "paiement.reussi", "evt_1").entetes, {});
    const second = webhookSimule(ref, "paiement.reussi", "evt_2");

    expect(await ctx.service.recevoirWebhook("SIMULE", second.corps, second.entetes, {})).toEqual({ statut: "traite" });

    expect(ctx.abonnements).toHaveLength(1);
    expect(ctx.paiements.filter((p) => p.statut === "CONFIRME")).toHaveLength(1);
    expect(await ctx.service.confirmer(ctx.paiements[0]!.id as string)).toBe("deja-traite");
  });

  it("signature invalide ⇒ 401 et aucun effet en base", async () => {
    const { corps } = webhookSimule(ref);

    await expect(ctx.service.recevoirWebhook("SIMULE", corps, { "x-signature-simulateur": "t=1,v1=faux" }, {})).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(ctx.service.recevoirWebhook("SIMULE", corps, {}, {})).rejects.toBeInstanceOf(UnauthorizedException);

    expect(ctx.evenements).toEqual([]);
    expect(ctx.abonnements).toEqual([]);
    expect(ctx.paiements[0]!.statut).toBe("EN_ATTENTE");
    expect(ctx.delegues.paiement.updateMany).not.toHaveBeenCalled();
  });

  it("corps illisible ⇒ 401, fournisseur inconnu ⇒ 404", async () => {
    const corps = "pas du json";
    const entetes = { "x-signature-simulateur": signerWebhook(SECRET, Math.floor(Date.now() / 1000), corps) };

    await expect(ctx.service.recevoirWebhook("SIMULE", corps, entetes, {})).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(ctx.service.recevoirWebhook("PAYPAL", "{}", {}, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it("échec du paiement : statut ECHOUE, pas d'accès, payeur prévenu", async () => {
    const { corps, entetes } = webhookSimule(ref, "paiement.echoue");

    await ctx.service.recevoirWebhook("SIMULE", corps, entetes, {});

    expect(ctx.paiements[0]!.statut).toBe("ECHOUE");
    expect(ctx.abonnements).toEqual([]);
    expect(ctx.notifications.notifier).toHaveBeenCalledWith(["eleve-1"], "ABONNEMENT", expect.stringContaining("n'a pas abouti"));
  });

  it("montant inattendu : l'événement part en retraitement, rien n'est confirmé", async () => {
    const { corps, entetes } = webhookSimule(ref, "paiement.reussi", "evt_x", 1);

    expect(await ctx.service.recevoirWebhook("SIMULE", corps, entetes, {})).toEqual({ statut: "a-retraiter" });

    expect(ctx.paiements[0]!.statut).toBe("EN_ATTENTE");
    expect(ctx.evenements[0]).toMatchObject({ statut: "ECHEC", derniereErreur: expect.stringContaining("Montant inattendu") });
    expect(ctx.retraitement.programmer).toHaveBeenCalledWith("evenement-1");
  });

  it("file de retraitement : un événement en échec (paiement pas encore connu) est rejoué avec succès", async () => {
    const autre = webhookSimule("sim_inconnu", "paiement.reussi", "evt_tardif");
    expect(await ctx.service.recevoirWebhook("SIMULE", autre.corps, autre.entetes, {})).toEqual({ statut: "a-retraiter" });

    // Le paiement est retrouvé entre-temps (ex. réplication tardive) : le retraitement aboutit.
    ctx.paiements[0]!.refExterne = "sim_inconnu";
    await ctx.service.retraiter("evenement-1");

    expect(ctx.evenements[0]).toMatchObject({ statut: "TRAITE", tentatives: 2 });
    expect(ctx.paiements[0]!.statut).toBe("CONFIRME");
    await ctx.service.retraiter("evenement-1"); // déjà traité : sans effet
    expect(ctx.abonnements).toHaveLength(1);
  });

  it("un retraitement encore en échec relance l'erreur (BullMQ réessaiera)", async () => {
    const autre = webhookSimule("sim_jamais", "paiement.reussi", "evt_perdu");
    await ctx.service.recevoirWebhook("SIMULE", autre.corps, autre.entetes, {});

    await expect(ctx.service.retraiter("evenement-1")).rejects.toThrow(/introuvable/);
    expect(ctx.evenements[0]).toMatchObject({ statut: "ECHEC", tentatives: 2 });
  });
});

describe("PaiementsService — abonnement et cycle", () => {
  it("renouvellement anticipé : la deuxième période commence à la fin de la première", async () => {
    const ctx = creerService();
    for (const [index] of [0, 1].entries()) {
      await ctx.service.creer(ELEVE, { plan: "PREMIUM_MENSUEL", fournisseur: "SIMULE" });
      await ctx.service.confirmer(ctx.paiements[index]!.id as string, new Date("2026-10-08T10:00:00Z"));
    }

    expect(ctx.abonnements.map((a) => [(a.debutLe as Date).toISOString(), (a.expireLe as Date).toISOString()])).toEqual([
      ["2026-10-08T10:00:00.000Z", "2026-11-08T10:00:00.000Z"],
      ["2026-11-08T10:00:00.000Z", "2026-12-08T10:00:00.000Z"],
    ]);
    expect(ctx.paiements.map((p) => p.numeroRecu)).toEqual(["XE-2026-000001", "XE-2026-000002"]);
    expect(await ctx.service.etat("eleve-1", new Date("2026-10-20T00:00:00Z"))).toEqual({ premium: true, jusquau: "2026-12-08T10:00:00.000Z", aRenouveler: false });
  });

  it("parent payeur : l'enfant et le parent sont prévenus", async () => {
    const ctx = creerService();
    await ctx.service.creer(PARENT, { plan: "PREMIUM_ANNUEL", fournisseur: "SIMULE", beneficiaireId: "eleve-1" });

    await ctx.service.confirmer(ctx.paiements[0]!.id as string);

    expect(ctx.notifications.notifier).toHaveBeenCalledWith(["parent-1"], "ABONNEMENT", expect.stringContaining("Premium activé pour Fatou"));
  });

  it("cycle : expiration (rétrogradation douce) puis relance J-3 d'une autre période, une seule fois", async () => {
    const ctx = creerService();
    ctx.abonnements.push(
      { id: "a-fini", utilisateurId: "eleve-1", plan: "PREMIUM_MENSUEL", statut: "ACTIF", debutLe: new Date("2026-09-01T00:00:00Z"), expireLe: new Date("2026-10-01T00:00:00Z"), relanceLe: null },
      { id: "a-bientot", utilisateurId: "eleve-2", plan: "PREMIUM_MENSUEL", statut: "ACTIF", debutLe: new Date("2026-09-10T00:00:00Z"), expireLe: new Date("2026-10-10T00:00:00Z"), relanceLe: null },
    );
    const maintenant = new Date("2026-10-08T10:00:00Z");

    expect(await ctx.service.cycle(maintenant)).toEqual({ expires: 1, relances: 1 });
    expect(await ctx.service.cycle(maintenant)).toEqual({ expires: 0, relances: 0 });

    expect(ctx.abonnements.find((a) => a.id === "a-fini")!.statut).toBe("EXPIRE");
    expect(ctx.notifications.notifier).toHaveBeenCalledWith(["eleve-1"], "ABONNEMENT", expect.stringContaining("a pris fin le 1 octobre 2026"));
    expect(ctx.notifications.notifier).toHaveBeenCalledWith(["eleve-1"], "ABONNEMENT", expect.stringContaining("se termine le 10 octobre 2026"));
    expect(ctx.mail.envoyer).toHaveBeenCalledWith(expect.objectContaining({ destinataire: "fatou@example.sn", sujet: expect.stringContaining("se termine bientôt") }));
  });

  it("vérification au retour : interroge le fournisseur et confirme si le paiement est passé", async () => {
    const verifiable: PaymentProvider = {
      code: "WAVE",
      libelle: "Wave",
      creerCheckout: vi.fn().mockResolvedValue({ refExterne: "cos-1", urlPaiement: "https://pay.wave.com/c/cos-1" }),
      verifier: vi.fn().mockResolvedValue("CONFIRME"),
      lireWebhook: vi.fn(),
    };
    const ctx = creerService(new Map([["WAVE", verifiable]]));
    const { paiementId } = await ctx.service.creer(ELEVE, { plan: "PREMIUM_MENSUEL", fournisseur: "WAVE" });

    const paiement = await ctx.service.verifier(paiementId, "eleve-1");

    expect(paiement.statut).toBe("CONFIRME");
    await expect(ctx.service.lire(paiementId, "intrus")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reçu indisponible tant que le paiement n'est pas confirmé", async () => {
    const ctx = creerService();
    const { paiementId } = await ctx.service.creer(ELEVE, { plan: "PREMIUM_MENSUEL", fournisseur: "SIMULE" });
    ctx.delegues.paiement.findUnique.mockResolvedValueOnce({ ...ctx.paiements[0], abonnement: null } as never);

    await expect(ctx.service.donneesRecu(paiementId, "eleve-1")).rejects.toBeInstanceOf(ConflictException);
  });
});
