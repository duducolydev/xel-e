import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import type { Env } from "../config/env";
import { FUSEAU_PLATEFORME } from "../progression/temps";
import { PaiementsService } from "./paiements.service";

export const NOM_FILE_PAIEMENTS = "paiements";
export const TENTATIVES_RETRAITEMENT = 8;

// File de retraitement des webhooks en échec (backoff exponentiel) et cycle horaire des abonnements
// (expirations, relances J-3).
@Injectable()
export class FilePaiements implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FilePaiements.name);
  private connexion?: Redis;
  private file?: Queue;
  private worker?: Worker;

  constructor(
    private readonly paiements: PaiementsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.connexion = new Redis(this.config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: null });
    this.connexion.on("error", (error) => this.logger.warn(`Redis (file des paiements) : ${error.message}`));
    const file = new Queue(NOM_FILE_PAIEMENTS, { connection: this.connexion });
    this.file = file;
    this.worker = new Worker(
      NOM_FILE_PAIEMENTS,
      async (job) => {
        if (job.name === "retraiter") return this.paiements.retraiter(job.data.evenementId as string);
        if (job.name === "cycle") return this.paiements.cycle();
        throw new Error(`Job inconnu : ${job.name}`);
      },
      { connection: this.connexion, concurrency: 5 },
    );
    this.worker.on("failed", (job, error) => this.logger.warn(`Job ${job?.name} ${job?.id} en échec (tentative ${job?.attemptsMade}) : ${error.message}`));
    this.paiements.brancherRetraitement(this);
    if (this.config.get("ABONNEMENTS_PLANIFIES", { infer: true })) {
      await file.upsertJobScheduler("cycle-abonnements", { pattern: "5 * * * *", tz: FUSEAU_PLATEFORME }, { name: "cycle", data: {} });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.file?.close();
    this.connexion?.disconnect();
  }

  async programmer(evenementId: string): Promise<void> {
    try {
      await this.file?.add(
        "retraiter",
        { evenementId },
        {
          jobId: `evenement-${evenementId}`,
          attempts: TENTATIVES_RETRAITEMENT,
          backoff: { type: "exponential", delay: this.config.get("RESUME_BACKOFF_MS", { infer: true }) },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    } catch (error) {
      this.logger.error(`Retraitement non programmé (${evenementId}) : ${(error as Error).message}`);
    }
  }
}
