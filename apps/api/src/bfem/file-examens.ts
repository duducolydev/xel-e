import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import type { Env } from "../config/env";
import { ExamensService } from "./examens.service";

export const NOM_FILE_EXAMENS = "examens";
// Petite marge après la limite : les réponses arrivées pile à l'heure sont déjà enregistrées.
export const MARGE_SOUMISSION_MS = 1000;

export function delaiSoumission(expireLe: Date, maintenant: Date): number {
  return Math.max(0, expireLe.getTime() - maintenant.getTime() + MARGE_SOUMISSION_MS);
}

// Soumission automatique à la fin du temps, même si l'élève a fermé la page.
@Injectable()
export class FileExamens implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileExamens.name);
  private connexion?: Redis;
  private file?: Queue;
  private worker?: Worker;

  constructor(
    private readonly examens: ExamensService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    this.connexion = new Redis(this.config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: null });
    this.connexion.on("error", (error) => this.logger.warn(`Redis (file des examens) : ${error.message}`));
    this.file = new Queue(NOM_FILE_EXAMENS, { connection: this.connexion });
    this.worker = new Worker(NOM_FILE_EXAMENS, async (job) => (await this.examens.finaliser(job.data.copieId as string)).id, {
      connection: this.connexion,
      concurrency: 10,
    });
    this.worker.on("failed", (job, error) => this.logger.warn(`Soumission automatique ${job?.id} en échec : ${error.message}`));
    this.examens.brancherProgrammateur(this);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.file?.close();
    this.connexion?.disconnect();
  }

  async programmer(copieId: string, expireLe: Date): Promise<void> {
    try {
      await this.file?.add(
        "soumettre",
        { copieId },
        {
          jobId: `copie-${copieId}`,
          delay: delaiSoumission(expireLe, new Date()),
          attempts: 5,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      );
    } catch (error) {
      // Sans file, la copie est quand même rendue à sa prochaine lecture (voir ExamensService.etat).
      this.logger.warn(`Soumission automatique non programmée (${copieId}) : ${(error as Error).message}`);
    }
  }
}
