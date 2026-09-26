import type { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

export const MAILHOG_URL = process.env.MAILHOG_API_URL ?? "http://127.0.0.1:8025";

export async function viderBase(prisma: PrismaClient): Promise<void> {
  await prisma.refreshToken.deleteMany();
  await prisma.jetonVerification.deleteMany();
  await prisma.signalement.deleteMany();
  await prisma.message.deleteMany();
  await prisma.sujetForum.deleteMany();
  await prisma.badgeUtilisateur.deleteMany();
  await prisma.badge.deleteMany();
  await prisma.progression.deleteMany();
  await prisma.tentative.deleteMany();
  await prisma.question.deleteMany();
  await prisma.quiz.deleteMany();
  await prisma.versionLecon.deleteMany();
  await prisma.lecon.deleteMany();
  await prisma.chapitre.deleteMany();
  await prisma.paiement.deleteMany();
  await prisma.abonnement.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.parentLink.deleteMany();
  await prisma.user.deleteMany();
  await prisma.matiere.deleteMany();
  await prisma.niveau.deleteMany();
}

export async function viderLimiteurs(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
  try {
    const cles = await redis.keys("rl:*");
    if (cles.length > 0) await redis.del(...cles);
  } finally {
    redis.disconnect();
  }
}

export async function viderMailhog(): Promise<void> {
  await fetch(`${MAILHOG_URL}/api/v1/messages`, { method: "DELETE" });
}

function decoderQuotedPrintable(texte: string): string {
  const sansCoupures = texte.replace(/=\r?\n/g, "");
  const octets: number[] = [];
  for (let i = 0; i < sansCoupures.length; i += 1) {
    const hex = sansCoupures.slice(i + 1, i + 3);
    if (sansCoupures[i] === "=" && /^[0-9A-F]{2}$/i.test(hex)) {
      octets.push(parseInt(hex, 16));
      i += 2;
    } else {
      octets.push(...Buffer.from(sansCoupures[i] ?? "", "utf8"));
    }
  }
  return Buffer.from(octets).toString("utf8");
}

function decoderSujet(sujet: string): string {
  return sujet
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi, (_tout, mode: string, contenu: string) =>
      mode.toLowerCase() === "b"
        ? Buffer.from(contenu, "base64").toString("utf8")
        : decoderQuotedPrintable(contenu.replace(/_/g, " ")),
    );
}

export interface MailRecu {
  sujet: string;
  corps: string;
}

interface MessageMailhog {
  Content: { Headers: Record<string, string[]>; Body: string };
}

// Les emails partent de façon asynchrone : on sonde mailhog quelques secondes.
export async function attendreMail(destinataire: string, sujetContient: string): Promise<MailRecu> {
  for (let essai = 0; essai < 40; essai += 1) {
    const reponse = await fetch(
      `${MAILHOG_URL}/api/v2/search?kind=to&query=${encodeURIComponent(destinataire)}`,
    );
    const { items } = (await reponse.json()) as { items: MessageMailhog[] };
    for (const item of items) {
      const encodage = item.Content.Headers["Content-Transfer-Encoding"]?.[0] ?? "";
      const corps = /quoted-printable/i.test(encodage)
        ? decoderQuotedPrintable(item.Content.Body)
        : item.Content.Body;
      const sujet = decoderSujet(item.Content.Headers.Subject?.[0] ?? "");
      if (sujet.includes(sujetContient)) return { sujet, corps };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Aucun email « ${sujetContient} » reçu par ${destinataire}.`);
}

export function extraireLien(corps: string): string {
  const correspondance = corps.match(/https?:\/\/\S+token=[A-Za-z0-9_-]+/);
  if (!correspondance) throw new Error(`Aucun lien avec jeton dans l'email :\n${corps}`);
  return correspondance[0];
}

export function extraireJeton(corps: string): string {
  const jeton = new URL(extraireLien(corps)).searchParams.get("token");
  if (!jeton) throw new Error("Lien sans jeton.");
  return jeton;
}
