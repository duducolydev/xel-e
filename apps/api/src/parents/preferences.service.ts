import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PreferencesParent, PreferencesParentDto } from "@xel-e/shared";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

export const PREFERENCES_PAR_DEFAUT: PreferencesParent = {
  frequence: "HEBDOMADAIRE",
  email: true,
  whatsapp: false,
  sms: false,
  telephone: null,
};

const LIEN_INVALIDE = "Ce lien de désinscription est invalide.";

@Injectable()
export class PreferencesService {
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get("JWT_SECRET", { infer: true });
  }

  async lire(parentId: string): Promise<PreferencesParent> {
    const preferences = await this.prisma.preferencesParent.findUnique({ where: { parentId } });
    if (!preferences) return PREFERENCES_PAR_DEFAUT;
    const { frequence, email, whatsapp, sms, telephone } = preferences;
    return { frequence, email, whatsapp, sms, telephone };
  }

  async modifier(parentId: string, dto: PreferencesParentDto): Promise<PreferencesParent> {
    const data = { ...dto, telephone: dto.telephone ?? null };
    await this.prisma.preferencesParent.upsert({ where: { parentId }, update: data, create: { parentId, ...data } });
    return this.lire(parentId);
  }

  private signer(parentId: string): string {
    return createHmac("sha256", this.secret).update(`desinscription:${parentId}`).digest("base64url");
  }

  // Lien sans connexion, valable sans limite de durée (exigence d'un lien de désinscription).
  jetonDesinscription(parentId: string): string {
    return `${parentId}.${this.signer(parentId)}`;
  }

  async desinscrire(jeton: string): Promise<void> {
    const [parentId, signature] = jeton.split(".");
    if (!parentId || !signature) throw new BadRequestException(LIEN_INVALIDE);
    const attendue = Buffer.from(this.signer(parentId));
    const recue = Buffer.from(signature);
    if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) throw new BadRequestException(LIEN_INVALIDE);
    const parent = await this.prisma.user.findFirst({ where: { id: parentId, role: "PARENT" }, select: { id: true } });
    if (!parent) throw new BadRequestException(LIEN_INVALIDE);
    await this.prisma.preferencesParent.upsert({
      where: { parentId },
      update: { frequence: "AUCUNE" },
      create: { parentId, ...PREFERENCES_PAR_DEFAUT, frequence: "AUCUNE" },
    });
  }
}
