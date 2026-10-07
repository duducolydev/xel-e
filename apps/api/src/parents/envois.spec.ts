import type { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { MailService } from "../mail/mail.service";
import type { PrismaService } from "../prisma/prisma.service";
import { CanalHttp, CanalMock } from "./canaux";
import { optionsEnvoi, PLANIFICATIONS, TENTATIVES_ENVOI, traiterJob } from "./file-resumes";
import type { PreferencesService } from "./preferences.service";
import { canauxDe, ResumesService, type Envoi } from "./resumes.service";
import type { ActiviteEnfant } from "./resume";
import type { SuiviService } from "./suivi.service";

const config = { get: () => "https://xele.sn" } as unknown as ConfigService<Env, true>;

const ACTIVITE: ActiviteEnfant = {
  nomComplet: "Fatou Diop",
  minutes: 40,
  joursActifs: 2,
  leconsTerminees: ["Pythagore"],
  quiz: [{ titre: "Pythagore", score: 80 }],
  serie: 2,
};

function creerResumes(parents: unknown[] = []) {
  const prisma = {
    user: { findMany: vi.fn().mockResolvedValue(parents) },
    resumeEnvoye: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    notification: { create: vi.fn() },
  };
  const suivi = { activiteEntre: vi.fn().mockResolvedValue(ACTIVITE) };
  const preferences = { jetonDesinscription: vi.fn((id: string) => `${id}.signature`) };
  const mail = { envoyerOuEchouer: vi.fn() };
  const canal = new CanalMock();
  const service = new ResumesService(
    prisma as unknown as PrismaService,
    suivi as unknown as SuiviService,
    preferences as unknown as PreferencesService,
    mail as unknown as MailService,
    canal,
    config,
  );
  return { service, prisma, suivi, mail, canal };
}

const parent = (preferences: unknown, enfants = ["e1"]) => ({
  id: "parent-1",
  nomComplet: "Awa Diop",
  email: "awa@example.sn",
  preferences,
  enfants: enfants.map((enfantId) => ({ enfantId })),
});

describe("choix des canaux", () => {
  const base = { email: true, whatsapp: false, sms: false, telephone: null };

  it("in-app toujours, puis email selon les préférences", () => {
    expect(canauxDe(base, "awa@example.sn")).toEqual([
      { canal: "IN_APP", destinataire: "" },
      { canal: "EMAIL", destinataire: "awa@example.sn" },
    ]);
    expect(canauxDe({ ...base, email: false }, "awa@example.sn").map((c) => c.canal)).toEqual(["IN_APP"]);
  });

  it("WhatsApp et SMS seulement avec un numéro", () => {
    expect(canauxDe({ ...base, whatsapp: true, sms: true, telephone: null }, null).map((c) => c.canal)).toEqual(["IN_APP"]);
    expect(canauxDe({ ...base, whatsapp: true, sms: true, telephone: "+221771234567" }, null)).toEqual([
      { canal: "IN_APP", destinataire: "" },
      { canal: "WHATSAPP", destinataire: "+221771234567" },
      { canal: "SMS", destinataire: "+221771234567" },
    ]);
  });
});

describe("ResumesService.preparer", () => {
  it("hebdomadaire : inclut les parents sans préférences (réglage par défaut)", async () => {
    const { service, prisma } = creerResumes();

    await service.preparer("HEBDOMADAIRE", new Date("2026-10-11T18:00:00Z"));

    expect(prisma.user.findMany.mock.calls[0]?.[0].where).toMatchObject({
      role: "PARENT",
      OR: [{ preferences: null }, { preferences: { frequence: "HEBDOMADAIRE" } }],
    });
  });

  it("mensuel : seulement les parents qui l'ont choisi", async () => {
    const { service, prisma } = creerResumes();

    await service.preparer("MENSUELLE", new Date("2026-10-01T18:00:00Z"));

    expect(prisma.user.findMany.mock.calls[0]?.[0].where).toMatchObject({ preferences: { frequence: "MENSUELLE" } });
    expect(prisma.user.findMany.mock.calls[0]?.[0].where.OR).toBeUndefined();
  });

  it("un envoi par canal choisi : texte complet par email, texte court ailleurs", async () => {
    const { service, suivi } = creerResumes([
      parent({ frequence: "HEBDOMADAIRE", email: true, whatsapp: true, sms: false, telephone: "+221771234567" }, ["e1", "e2"]),
    ]);

    const { periode, envois } = await service.preparer("HEBDOMADAIRE", new Date("2026-10-11T18:00:00Z"));

    expect(suivi.activiteEntre).toHaveBeenCalledTimes(2);
    expect(periode.cle).toBe("2026-S41");
    expect(envois.map((e) => [e.canal, e.destinataire])).toEqual([
      ["IN_APP", ""],
      ["EMAIL", "awa@example.sn"],
      ["WHATSAPP", "+221771234567"],
    ]);
    const email = envois.find((e) => e.canal === "EMAIL")!;
    expect(email.texte).toContain("Bonjour Awa Diop,");
    expect(email.texte).toContain("https://xele.sn/desinscription?token=parent-1.signature");
    expect(envois.find((e) => e.canal === "WHATSAPP")!.texte).toMatch(/^Xel-E, semaine du 5 au 11 octobre — Fatou : 40 min/);
  });
});

describe("ResumesService.envoyer — dispatch multi-canaux", () => {
  const envoi = (canal: Envoi["canal"], destinataire = "+221771234567"): Envoi => ({
    parentId: "parent-1",
    periode: "2026-S41",
    canal,
    destinataire,
    sujet: "Semaine du 5 au 11 octobre : le résumé Xel-E",
    texte: "Xel-E, semaine du 5 au 11 octobre — Fatou : 40 min",
  });

  it("le fournisseur mock reçoit exactement les messages WhatsApp et SMS attendus", async () => {
    const { service, canal, prisma } = creerResumes();

    await service.envoyer(envoi("WHATSAPP"));
    await service.envoyer(envoi("SMS", "+221781112233"));

    expect(canal.envoyes).toEqual([
      { canal: "WHATSAPP", destinataire: "+221771234567", message: "Xel-E, semaine du 5 au 11 octobre — Fatou : 40 min" },
      { canal: "SMS", destinataire: "+221781112233", message: "Xel-E, semaine du 5 au 11 octobre — Fatou : 40 min" },
    ]);
    expect(prisma.resumeEnvoye.create).toHaveBeenCalledTimes(2);
  });

  it("in-app crée une notification, email part par SMTP", async () => {
    const { service, prisma, mail, canal } = creerResumes();

    await service.envoyer(envoi("IN_APP", ""));
    await service.envoyer(envoi("EMAIL", "awa@example.sn"));

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { utilisateurId: "parent-1", type: "RESUME", contenu: "Xel-E, semaine du 5 au 11 octobre — Fatou : 40 min" },
    });
    expect(mail.envoyerOuEchouer).toHaveBeenCalledWith({
      destinataire: "awa@example.sn",
      sujet: "Semaine du 5 au 11 octobre : le résumé Xel-E",
      texte: "Xel-E, semaine du 5 au 11 octobre — Fatou : 40 min",
    });
    expect(canal.envoyes).toEqual([]);
  });

  it("ne renvoie pas un résumé déjà envoyé (job rejoué)", async () => {
    const { service, prisma, canal } = creerResumes();
    prisma.resumeEnvoye.findUnique.mockResolvedValue({ id: "deja" });

    expect(await service.envoyer(envoi("SMS"))).toBe("deja-envoye");
    expect(canal.envoyes).toEqual([]);
  });

  it("échec d'un canal : l'erreur remonte (pour la nouvelle tentative) et rien n'est marqué envoyé", async () => {
    const { service, canal, prisma } = creerResumes();
    canal.programmerEchecs(1);

    await expect(service.envoyer(envoi("WHATSAPP"))).rejects.toThrow(/Échec simulé/);
    expect(prisma.resumeEnvoye.create).not.toHaveBeenCalled();

    // Nouvelle tentative : cette fois le message part, une seule fois.
    expect(await service.envoyer(envoi("WHATSAPP"))).toBe("envoye");
    expect(canal.envoyes).toHaveLength(1);
  });

  it("une trace créée en parallèle par un autre worker n'est pas une erreur", async () => {
    const { service, prisma } = creerResumes();
    prisma.resumeEnvoye.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "5" }));

    expect(await service.envoyer(envoi("SMS"))).toBe("envoye");
  });

  it("relaie les autres erreurs d'enregistrement", async () => {
    const { service, prisma } = creerResumes();
    prisma.resumeEnvoye.create.mockRejectedValue(new Error("base indisponible"));

    await expect(service.envoyer(envoi("SMS"))).rejects.toThrow("base indisponible");
  });
});

describe("file des résumés (BullMQ)", () => {
  const envoi: Envoi = { parentId: "p1", periode: "2026-S41", canal: "SMS", destinataire: "+221", sujet: "s", texte: "t" };

  it("planifie le dimanche 18 h et le 1er du mois 18 h", () => {
    expect(PLANIFICATIONS).toEqual([
      { id: "resume-hebdomadaire", pattern: "0 18 * * 0", type: "HEBDOMADAIRE" },
      { id: "resume-mensuel", pattern: "0 18 1 * *", type: "MENSUELLE" },
    ]);
  });

  it("chaque envoi est retenté avec un backoff exponentiel, sous un identifiant stable", () => {
    expect(optionsEnvoi(envoi, 60_000)).toMatchObject({
      jobId: "p1-2026-S41-SMS",
      attempts: TENTATIVES_ENVOI,
      backoff: { type: "exponential", delay: 60_000 },
    });
    expect(TENTATIVES_ENVOI).toBeGreaterThan(1);
  });

  it("le job « periode » crée un job d'envoi par parent et par canal", async () => {
    const resumes = { preparer: vi.fn().mockResolvedValue({ envois: [envoi, { ...envoi, canal: "EMAIL" }] }), envoyer: vi.fn() };
    const ajouter = vi.fn();

    const nombre = await traiterJob({ name: "periode", data: { type: "HEBDOMADAIRE", maintenant: "2026-10-11T18:00:00.000Z" } }, resumes, ajouter, 50);

    expect(nombre).toBe(2);
    expect(resumes.preparer).toHaveBeenCalledWith("HEBDOMADAIRE", new Date("2026-10-11T18:00:00.000Z"));
    expect(ajouter.mock.calls[0]?.[0]).toEqual([
      { name: "envoi", data: envoi, opts: optionsEnvoi(envoi, 50) },
      { name: "envoi", data: { ...envoi, canal: "EMAIL" }, opts: optionsEnvoi({ ...envoi, canal: "EMAIL" }, 50) },
    ]);
  });

  it("le job « envoi » laisse remonter l'échec du canal (BullMQ retentera), sans toucher aux autres", async () => {
    const resumes = { preparer: vi.fn(), envoyer: vi.fn().mockRejectedValueOnce(new Error("WhatsApp indisponible")).mockResolvedValue("envoye") };

    await expect(traiterJob({ name: "envoi", data: envoi }, resumes, vi.fn(), 50)).rejects.toThrow("WhatsApp indisponible");
    await expect(traiterJob({ name: "envoi", data: envoi }, resumes, vi.fn(), 50)).resolves.toBe("envoye");
  });

  it("rejette un job inconnu", async () => {
    await expect(traiterJob({ name: "autre", data: {} }, { preparer: vi.fn(), envoyer: vi.fn() }, vi.fn(), 50)).rejects.toThrow(/inconnu/);
  });
});

describe("passerelle HTTP WhatsApp/SMS", () => {
  it("poste le message en JSON avec le jeton", async () => {
    const requete = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const canal = new CanalHttp("https://passerelle.example/envoi", "jeton", requete as unknown as typeof fetch);

    await canal.envoyer("WHATSAPP", "+221771234567", "Bonjour");

    const [url, init] = requete.mock.calls[0]!;
    expect(url).toBe("https://passerelle.example/envoi");
    expect(init.headers).toMatchObject({ Authorization: "Bearer jeton", "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ canal: "whatsapp", destinataire: "+221771234567", message: "Bonjour" });
  });

  it("une réponse en erreur fait échouer l'envoi (donc une nouvelle tentative)", async () => {
    const canal = new CanalHttp("https://passerelle.example/envoi", undefined, vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch);

    await expect(canal.envoyer("SMS", "+221", "x")).rejects.toThrow(/503/);
  });
});
