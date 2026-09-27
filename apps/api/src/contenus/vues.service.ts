import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import { REDIS_CLIENT } from "../redis/redis.module";
import { FILTRE_LECONS_PUBLIQUES } from "./workflow";

export const FENETRE_VUE_S = 60 * 60;

// Une vue = un visiteur (empreinte IP + navigateur, jamais stockée en clair) par leçon et par heure.
@Injectable()
export class VuesService {
  private readonly logger = new Logger(VuesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async enregistrer(slug: string, ip: string, navigateur: string): Promise<void> {
    const lecon = await this.prisma.lecon.findFirst({ where: { slug, ...FILTRE_LECONS_PUBLIQUES }, select: { id: true } });
    if (!lecon) return;
    const empreinte = createHash("sha256").update(`${ip}|${navigateur}`).digest("hex").slice(0, 32);
    try {
      const nouvelle = await this.redis.set(`vue:${lecon.id}:${empreinte}`, "1", "EX", FENETRE_VUE_S, "NX");
      if (nouvelle !== "OK") return;
    } catch (error) {
      // Sans Redis, impossible de dédoublonner : mieux vaut ne pas compter que gonfler les chiffres.
      this.logger.warn(`Vue non comptée : ${(error as Error).message}`);
      return;
    }
    await this.prisma.lecon.update({ where: { id: lecon.id }, data: { vues: { increment: 1 } } });
  }
}
