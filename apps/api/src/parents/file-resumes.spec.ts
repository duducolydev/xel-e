import type { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import { FileResumes } from "./file-resumes";
import type { ResumesService } from "./resumes.service";

const bullmq = vi.hoisted(() => {
  const files: { nom: string; upsertJobScheduler: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn>; addBulk: ReturnType<typeof vi.fn>; getJobCounts: ReturnType<typeof vi.fn>; getDelayed: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[] = [];
  const workers: { nom: string; processeur: (job: unknown) => Promise<unknown>; on: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[] = [];
  return { files, workers };
});

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation((nom: string) => {
    const file = {
      nom,
      upsertJobScheduler: vi.fn(),
      add: vi.fn().mockResolvedValue({ id: "job-42" }),
      addBulk: vi.fn(),
      getJobCounts: vi.fn().mockResolvedValue({ waiting: 0, active: 0, prioritized: 0 }),
      getDelayed: vi.fn().mockResolvedValue([]),
      close: vi.fn(),
    };
    bullmq.files.push(file);
    return file;
  }),
  Worker: vi.fn().mockImplementation((nom: string, processeur: (job: unknown) => Promise<unknown>) => {
    const worker = { nom, processeur, on: vi.fn(), close: vi.fn() };
    bullmq.workers.push(worker);
    return worker;
  }),
}));

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({ on: vi.fn(), disconnect: vi.fn() })),
}));


function creerFile(planifies: boolean) {
  const valeurs: Record<string, unknown> = { REDIS_URL: "redis://localhost:6379", RESUME_BACKOFF_MS: 50, RESUMES_PLANIFIES: planifies };
  const config = { get: (cle: string) => valeurs[cle] } as unknown as ConfigService<Env, true>;
  const resumes = { preparer: vi.fn().mockResolvedValue({ envois: [] }), envoyer: vi.fn().mockResolvedValue("envoye") };
  return { service: new FileResumes(resumes as unknown as ResumesService, config), resumes };
}

beforeEach(() => {
  bullmq.files.length = 0;
  bullmq.workers.length = 0;
});

describe("FileResumes (branchement BullMQ)", () => {
  it("planifie les résumés dimanche 18 h et le 1er à 18 h, heure de Dakar", async () => {
    const { service } = creerFile(true);

    await service.onModuleInit();

    const file = bullmq.files[0]!;
    expect(file.nom).toBe("resumes");
    expect(file.upsertJobScheduler.mock.calls).toEqual([
      ["resume-hebdomadaire", { pattern: "0 18 * * 0", tz: "Africa/Dakar" }, { name: "periode", data: { type: "HEBDOMADAIRE" } }],
      ["resume-mensuel", { pattern: "0 18 1 * *", tz: "Africa/Dakar" }, { name: "periode", data: { type: "MENSUELLE" } }],
    ]);
  });

  it("ne planifie rien quand la planification est désactivée (tests, worker séparé)", async () => {
    const { service } = creerFile(false);

    await service.onModuleInit();

    expect(bullmq.files[0]!.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it("le worker traite les jobs avec le service des résumés", async () => {
    const { service, resumes } = creerFile(false);
    await service.onModuleInit();
    const envoi = { parentId: "p1", periode: "2026-S41", canal: "SMS", destinataire: "+221", sujet: "s", texte: "t" };

    await expect(bullmq.workers[0]!.processeur({ name: "envoi", data: envoi })).resolves.toBe("envoye");
    expect(resumes.envoyer).toHaveBeenCalledWith(envoi);
    expect(bullmq.workers[0]!.on).toHaveBeenCalledWith("failed", expect.any(Function));
  });

  it("déclenche un résumé à la demande, à une date donnée", async () => {
    const { service } = creerFile(false);
    await service.onModuleInit();

    expect(await service.declencher("MENSUELLE", new Date("2026-10-01T18:00:00Z"))).toBe("job-42");
    expect(bullmq.files[0]!.add).toHaveBeenCalledWith("periode", { type: "MENSUELLE", maintenant: "2026-10-01T18:00:00.000Z" });
  });

  it("attend que la file soit vide, ou échoue au-delà du délai", async () => {
    const { service } = creerFile(false);
    await service.onModuleInit();
    const file = bullmq.files[0]!;

    file.getJobCounts.mockResolvedValueOnce({ waiting: 1, active: 0, prioritized: 0 });
    await expect(service.attendreFin(5_000)).resolves.toBeUndefined();
    expect(file.getJobCounts).toHaveBeenCalledTimes(3);

    // Les prochaines occurrences planifiées ne retiennent pas l'attente…
    file.getDelayed.mockResolvedValue([{ id: "repeat:resume-hebdomadaire:1791741600000" }]);
    await expect(service.attendreFin(5_000)).resolves.toBeUndefined();

    // … mais un envoi en attente de nouvelle tentative, si.
    file.getDelayed.mockResolvedValue([{ id: "p1-2026-S41-SMS" }]);
    await expect(service.attendreFin(150)).rejects.toThrow(/pas vidée/);
  });

  it("refuse de déclencher avant l'initialisation et ferme proprement", async () => {
    const { service } = creerFile(false);
    await expect(service.declencher("HEBDOMADAIRE")).rejects.toThrow(/non initialisée/);
    await expect(service.attendreFin()).resolves.toBeUndefined();

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(bullmq.workers[0]!.close).toHaveBeenCalled();
    expect(bullmq.files[0]!.close).toHaveBeenCalled();
  });
});
