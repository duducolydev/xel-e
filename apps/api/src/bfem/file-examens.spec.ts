import type { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { ExamensService } from "./examens.service";
import { FileExamens, MARGE_SOUMISSION_MS } from "./file-examens";

const bullmq = vi.hoisted(() => ({
  files: [] as { nom: string; add: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[],
  workers: [] as { nom: string; processeur: (job: { data: unknown }) => Promise<unknown>; on: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[],
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation((nom: string) => {
    const file = { nom, add: vi.fn(), close: vi.fn() };
    bullmq.files.push(file);
    return file;
  }),
  Worker: vi.fn().mockImplementation((nom: string, processeur: (job: { data: unknown }) => Promise<unknown>) => {
    const worker = { nom, processeur, on: vi.fn(), close: vi.fn() };
    bullmq.workers.push(worker);
    return worker;
  }),
}));

vi.mock("ioredis", () => ({ default: vi.fn().mockImplementation(() => ({ on: vi.fn(), disconnect: vi.fn() })) }));

function creer() {
  const config = { get: () => "redis://localhost:6379" } as unknown as ConfigService<Env, true>;
  const examens = { finaliser: vi.fn().mockResolvedValue({ id: "copie-1" }), brancherProgrammateur: vi.fn() };
  return { service: new FileExamens(examens as unknown as ExamensService, config), examens };
}

beforeEach(() => {
  bullmq.files.length = 0;
  bullmq.workers.length = 0;
});

describe("FileExamens (soumission automatique)", () => {
  it("se branche sur le service des examens au démarrage", () => {
    const { service, examens } = creer();

    service.onModuleInit();

    expect(bullmq.files[0]?.nom).toBe("examens");
    expect(examens.brancherProgrammateur).toHaveBeenCalledWith(service);
  });

  it("programme la soumission juste après la limite, sous un identifiant par copie", async () => {
    const { service } = creer();
    service.onModuleInit();
    vi.useFakeTimers({ now: new Date("2026-10-08T10:00:00Z") });

    await service.programmer("copie-1", new Date("2026-10-08T12:00:00Z"));

    expect(bullmq.files[0]!.add).toHaveBeenCalledWith(
      "soumettre",
      { copieId: "copie-1" },
      expect.objectContaining({ jobId: "copie-copie-1", delay: 2 * 3600_000 + MARGE_SOUMISSION_MS, attempts: 5 }),
    );
    vi.useRealTimers();
  });

  it("le worker rend la copie", async () => {
    const { service, examens } = creer();
    service.onModuleInit();

    await expect(bullmq.workers[0]!.processeur({ data: { copieId: "copie-1" } })).resolves.toBe("copie-1");
    expect(examens.finaliser).toHaveBeenCalledWith("copie-1");
  });

  it("une file indisponible n'empêche pas de démarrer l'examen (la lecture rendra la copie)", async () => {
    const { service } = creer();
    service.onModuleInit();
    bullmq.files[0]!.add.mockRejectedValue(new Error("Redis indisponible"));

    await expect(service.programmer("copie-1", new Date())).resolves.toBeUndefined();
  });

  it("ferme worker et file à l'arrêt", async () => {
    const { service } = creer();
    service.onModuleInit();

    await service.onModuleDestroy();

    expect(bullmq.workers[0]!.close).toHaveBeenCalled();
    expect(bullmq.files[0]!.close).toHaveBeenCalled();
  });
});
