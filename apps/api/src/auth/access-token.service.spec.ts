import type { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import { AccessTokenService } from "./access-token.service";

function creerService(secret = "secret-de-test-assez-long") {
  const config = { get: () => 900 } as unknown as ConfigService<Env, true>;
  return new AccessTokenService(new JwtService({ secret }), config);
}

describe("AccessTokenService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("signe un jeton qui porte l'identifiant et le rôle", async () => {
    const service = creerService();

    const token = await service.signer({ id: "user-1", role: "ELEVE" });

    await expect(service.verifier(token)).resolves.toEqual({ id: "user-1", role: "ELEVE" });
  });

  it("refuse un jeton signé avec un autre secret", async () => {
    const token = await creerService("un-autre-secret-assez-long").signer({ id: "user-1", role: "ADMIN" });

    await expect(creerService().verifier(token)).resolves.toBeNull();
  });

  it("refuse un jeton expiré (15 minutes)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
    const service = creerService();
    const token = await service.signer({ id: "user-1", role: "ELEVE" });

    vi.setSystemTime(new Date("2026-09-26T10:15:01Z"));

    await expect(service.verifier(token)).resolves.toBeNull();
  });

  it("refuse une chaîne qui n'est pas un JWT", async () => {
    await expect(creerService().verifier("pas-un-jwt")).resolves.toBeNull();
  });
});
