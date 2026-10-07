import { Inject, Injectable, Logger } from "@nestjs/common";
import Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import { jourLocal } from "../progression/temps";
import { REDIS_CLIENT } from "../redis/redis.module";

// Temps d'activité : les pages leçon et quiz envoient un signal par minute tant qu'elles sont au
// premier plan. Une minute ne compte qu'une fois par élève, même avec plusieurs onglets ouverts.
@Injectable()
export class ActiviteService {
  private readonly logger = new Logger(ActiviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async signalerPresence(eleveId: string, maintenant = new Date()): Promise<void> {
    const minute = Math.floor(maintenant.getTime() / 60_000);
    try {
      const nouvelle = await this.redis.set(`presence:${eleveId}:${minute}`, "1", "EX", 120, "NX");
      if (nouvelle !== "OK") return;
    } catch (error) {
      this.logger.warn(`Présence non comptée : ${(error as Error).message}`);
      return;
    }
    const jour = jourLocal(maintenant);
    await this.prisma.activiteJour.upsert({
      where: { utilisateurId_jour: { utilisateurId: eleveId, jour } },
      update: { minutes: { increment: 1 } },
      create: { utilisateurId: eleveId, jour, minutes: 1 },
    });
  }
}
