import type { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import { FilePaiements, TENTATIVES_RETRAITEMENT } from "./file-paiements";
import type { PaiementsService } from "./paiements.service";

const bullmq = vi.hoisted(() => ({
  files: [] as { add: ReturnType<typeof vi.fn>; upsertJobScheduler: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[],
  workers: [] as { processeur: (job: { name: string; data: Record<string, unknown> }) => Promise<unknown>; on: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[],
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => {
    const file = { add: vi.fn(), upsertJobScheduler: vi.fn(), close: vi.fn() };
    bullmq.files.push(file);
    return file;
  }),
  Worker: vi.fn().mockImplementation((_nom: string, processeur: (job: { name: string; data: Record<string, unknown> }) => Promise<unknown>) => {
    const worker = { processeur, on: vi.fn(), close: vi.fn() };
    bullmq.workers.push(worker);
    return worker;
  }),
}));
vi.mock("ioredis", () => ({ default: vi.fn().mockImplementation(() => ({ on: vi.fn(), disconnect: vi.fn() })) }));

function creer(planifie: boolean) {
  const valeurs: Record<string, unknown> = { REDIS_URL: "redis://localhost", ABONNEMENTS_PLANIFIES: planifie, RESUME_BACKOFF_MS: 50 };
  const config = { get: (cle: string) => valeurs[cle] } as unknown as ConfigService<Env, true>;
  const paiements = { retraiter: vi.fn(), cycle: vi.fn().mockResolvedValue({ expires: 0, relances: 0 }), brancherRetraitement: vi.fn() };
  return { service: new FilePaiements(paiements as unknown as PaiementsService, config), paiements };
}

beforeEach(() => {
  bullmq.files.length = 0;
  bullmq.workers.length = 0;
});

describe("FilePaiements", () => {
  it("planifie le cycle des abonnements chaque heure (heure de Dakar), sauf si désactivé", async () => {
    await creer(true).service.onModuleInit();
    expect(bullmq.files[0]!.upsertJobScheduler).toHaveBeenCalledWith("cycle-abonnements", { pattern: "5 * * * *", tz: "Africa/Dakar" }, { name: "cycle", data: {} });

    await creer(false).service.onModuleInit();
    expect(bullmq.files[1]!.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it("programme le retraitement d'un webhook avec backoff exponentiel", async () => {
    const { service, paiements } = creer(false);
    await service.onModuleInit();

    await service.programmer("evenement-1");

    expect(paiements.brancherRetraitement).toHaveBeenCalledWith(service);
    expect(bullmq.files[0]!.add).toHaveBeenCalledWith(
      "retraiter",
      { evenementId: "evenement-1" },
      expect.objectContaining({ jobId: "evenement-evenement-1", attempts: TENTATIVES_RETRAITEMENT, backoff: { type: "exponential", delay: 50 } }),
    );
  });

  it("le worker retraite les événements et exécute le cycle", async () => {
    const { service, paiements } = creer(false);
    await service.onModuleInit();
    const worker = bullmq.workers[0]!;

    await worker.processeur({ name: "retraiter", data: { evenementId: "evenement-1" } });
    await worker.processeur({ name: "cycle", data: {} });

    expect(paiements.retraiter).toHaveBeenCalledWith("evenement-1");
    expect(paiements.cycle).toHaveBeenCalled();
    await expect(worker.processeur({ name: "autre", data: {} })).rejects.toThrow(/inconnu/);
  });

  it("une file indisponible n'interrompt pas la réception du webhook", async () => {
    const { service } = creer(false);
    await service.onModuleInit();
    bullmq.files[0]!.add.mockRejectedValue(new Error("Redis indisponible"));

    await expect(service.programmer("evenement-1")).resolves.toBeUndefined();
    await service.onModuleDestroy();
    expect(bullmq.workers[0]!.close).toHaveBeenCalled();
  });
});
