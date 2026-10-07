import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import Redis from "ioredis";
import type { Env } from "../config/env";
import { FUSEAU_PLATEFORME } from "../progression/temps";
import type { TypeResume } from "./periodes";
import { ResumesService, type Envoi } from "./resumes.service";

export const NOM_FILE = "resumes";
export const TENTATIVES_ENVOI = 6;

// Dimanche 18 h et le 1er du mois à 18 h, heure de Dakar.
export const PLANIFICATIONS: { id: string; pattern: string; type: TypeResume }[] = [
  { id: "resume-hebdomadaire", pattern: "0 18 * * 0", type: "HEBDOMADAIRE" },
  { id: "resume-mensuel", pattern: "0 18 1 * *", type: "MENSUELLE" },
];

export interface DonneesPeriode {
  type: TypeResume;
  // Instant de référence (déclenchement manuel) ; sinon l'instant d'exécution.
  maintenant?: string;
}

export function optionsEnvoi(envoi: Envoi, delaiMs: number): JobsOptions {
  return {
    // Identifiant déterministe : redéclencher la même période n'empile pas un second envoi.
    jobId: `${envoi.parentId}-${envoi.periode}-${envoi.canal}`,
    attempts: TENTATIVES_ENVOI,
    backoff: { type: "exponential", delay: delaiMs },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  };
}

// Un job « periode » compose les résumés puis crée un job « envoi » par parent et par canal :
// l'échec d'un canal (WhatsApp en panne) n'empêche pas les autres et n'est retenté que pour lui.
export async function traiterJob(
  job: Pick<Job, "name" | "data">,
  resumes: Pick<ResumesService, "preparer" | "envoyer">,
  ajouter: (jobs: { name: string; data: Envoi; opts: JobsOptions }[]) => Promise<unknown>,
  delaiMs: number,
): Promise<number | string> {
  if (job.name === "periode") {
    const donnees = job.data as DonneesPeriode;
    const { envois } = await resumes.preparer(donnees.type, donnees.maintenant ? new Date(donnees.maintenant) : new Date());
    await ajouter(envois.map((envoi) => ({ name: "envoi", data: envoi, opts: optionsEnvoi(envoi, delaiMs) })));
    return envois.length;
  }
  if (job.name === "envoi") return resumes.envoyer(job.data as Envoi);
  throw new Error(`Job inconnu : ${job.name}`);
}

@Injectable()
export class FileResumes implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileResumes.name);
  private connexion?: Redis;
  private file?: Queue;
  private worker?: Worker;

  constructor(
    private readonly resumes: ResumesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    // BullMQ exige une connexion dédiée sans limite de nouvelles tentatives par commande.
    this.connexion = new Redis(this.config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: null });
    this.connexion.on("error", (error) => this.logger.warn(`Redis (file des résumés) : ${error.message}`));
    const delaiMs = this.config.get("RESUME_BACKOFF_MS", { infer: true });
    const file = new Queue(NOM_FILE, { connection: this.connexion });
    this.file = file;
    this.worker = new Worker(
      NOM_FILE,
      (job) => traiterJob(job, this.resumes, (jobs) => file.addBulk(jobs), delaiMs),
      { connection: this.connexion, concurrency: 5 },
    );
    this.worker.on("failed", (job, error) =>
      this.logger.warn(`Job ${job?.name} ${job?.id} en échec (tentative ${job?.attemptsMade}) : ${error.message}`),
    );
    if (this.config.get("RESUMES_PLANIFIES", { infer: true })) {
      for (const { id, pattern, type } of PLANIFICATIONS) {
        await file.upsertJobScheduler(id, { pattern, tz: FUSEAU_PLATEFORME }, { name: "periode", data: { type } });
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.file?.close();
    this.connexion?.disconnect();
  }

  // Déclenchement manuel (administration, tests) d'un résumé, à la date donnée ou maintenant.
  async declencher(type: TypeResume, maintenant?: Date): Promise<string> {
    if (!this.file) throw new Error("File des résumés non initialisée.");
    const job = await this.file.add("periode", { type, maintenant: maintenant?.toISOString() } satisfies DonneesPeriode);
    return job.id ?? "";
  }

  // Attend que les résumés déclenchés soient traités (nouvelles tentatives comprises). Les prochaines
  // occurrences planifiées (« repeat:… », différées jusqu'à dimanche ou au 1er) ne comptent pas.
  async attendreFin(delaiMs = 30_000): Promise<void> {
    if (!this.file) return;
    const limite = Date.now() + delaiMs;
    // Un job peut changer d'état entre deux lectures (différé → en attente) : la file n'est
    // déclarée vide qu'après deux observations vides consécutives.
    let videsConsecutives = 0;
    while (Date.now() < limite) {
      const differes = (await this.file.getDelayed()).filter((job) => !job.id?.startsWith("repeat:"));
      const restants = await this.file.getJobCounts("waiting", "active", "prioritized");
      const vide = Object.values(restants).every((n) => n === 0) && differes.length === 0;
      videsConsecutives = vide ? videsConsecutives + 1 : 0;
      if (videsConsecutives >= 2) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("La file des résumés ne s'est pas vidée à temps.");
  }
}
