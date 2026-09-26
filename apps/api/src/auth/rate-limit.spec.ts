import { HttpException, HttpStatus, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type Redis from "ioredis";
import { describe, expect, it, vi } from "vitest";
import {
  LimiteurConnexion,
  LimiterDebit,
  MAX_ECHECS_CONNEXION,
  RateLimitGuard,
  type LimiteDebit,
} from "./rate-limit";

function contexte(handler: () => void, ip = "1.2.3.4") {
  const setHeader = vi.fn();
  const ctx = {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { ctx, setHeader };
}

function routeLimitee(limite: LimiteDebit): () => void {
  const handler = () => undefined;
  LimiterDebit(limite)(handler, "handler", { value: handler });
  return handler;
}

function redisCompteur() {
  const compteurs = new Map<string, number>();
  let cle = "";
  const chaine = {
    incr(c: string) {
      cle = c;
      compteurs.set(c, (compteurs.get(c) ?? 0) + 1);
      return chaine;
    },
    ttl() {
      return chaine;
    },
    exec: async () => [
      [null, compteurs.get(cle)],
      [null, -1],
    ],
  };
  return { multi: () => chaine, expire: vi.fn().mockResolvedValue(1) } as unknown as Redis;
}

describe("RateLimitGuard (limite par IP)", () => {
  it("laisse passer une route sans limite déclarée", async () => {
    const guard = new RateLimitGuard(new Reflector(), redisCompteur());
    const { ctx } = contexte(() => undefined);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("laisse passer jusqu'au maximum puis renvoie 429 avec Retry-After", async () => {
    const guard = new RateLimitGuard(new Reflector(), redisCompteur());
    const { ctx, setHeader } = contexte(routeLimitee({ nom: "test", max: 2, fenetreSecondes: 60 }));

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(setHeader).toHaveBeenCalledWith("Retry-After", "60");
  });

  it("compte chaque IP séparément", async () => {
    const guard = new RateLimitGuard(new Reflector(), redisCompteur());
    const route = routeLimitee({ nom: "test", max: 1, fenetreSecondes: 60 });

    await guard.canActivate(contexte(route, "1.1.1.1").ctx);

    await expect(guard.canActivate(contexte(route, "2.2.2.2").ctx)).resolves.toBe(true);
  });

  it("laisse passer si Redis est indisponible (fail-open journalisé)", async () => {
    const redis = {
      multi: () => ({
        incr() {
          return this;
        },
        ttl() {
          return this;
        },
        exec: () => Promise.reject(new Error("ECONNREFUSED")),
      }),
    } as unknown as Redis;
    const guard = new RateLimitGuard(new Reflector(), redis);
    const { ctx } = contexte(routeLimitee({ nom: "test", max: 1, fenetreSecondes: 60 }));

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});

function fauxRedis() {
  const valeurs = new Map<string, number>();
  const chaine = {
    incr(cle: string) {
      valeurs.set(cle, (valeurs.get(cle) ?? 0) + 1);
      return chaine;
    },
    expire() {
      return chaine;
    },
    exec: async () => [],
  };
  return {
    get: vi.fn(async (cle: string) => (valeurs.has(cle) ? String(valeurs.get(cle)) : null)),
    ttl: vi.fn(async () => 600),
    del: vi.fn(async (cle: string) => Number(valeurs.delete(cle))),
    multi: () => chaine,
  } as unknown as Redis;
}

describe("LimiteurConnexion", () => {
  it(`laisse ${MAX_ECHECS_CONNEXION} tentatives puis renvoie 429`, async () => {
    const limiteur = new LimiteurConnexion(fauxRedis());

    for (let i = 0; i < MAX_ECHECS_CONNEXION; i += 1) {
      await expect(limiteur.verifier("1.2.3.4", "awa")).resolves.toBeUndefined();
      await limiteur.enregistrerEchec("1.2.3.4", "awa");
    }

    const blocage = limiteur.verifier("1.2.3.4", "awa");
    await expect(blocage).rejects.toBeInstanceOf(HttpException);
    await expect(blocage).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });

  it("compte séparément chaque couple (IP, identifiant)", async () => {
    const limiteur = new LimiteurConnexion(fauxRedis());
    for (let i = 0; i < MAX_ECHECS_CONNEXION; i += 1) await limiteur.enregistrerEchec("1.2.3.4", "awa");

    await expect(limiteur.verifier("1.2.3.4", "ibou")).resolves.toBeUndefined();
    await expect(limiteur.verifier("5.6.7.8", "awa")).resolves.toBeUndefined();
  });

  it("repart de zéro après une connexion réussie", async () => {
    const limiteur = new LimiteurConnexion(fauxRedis());
    for (let i = 0; i < MAX_ECHECS_CONNEXION; i += 1) await limiteur.enregistrerEchec("1.2.3.4", "awa");

    await limiteur.reinitialiser("1.2.3.4", "awa");

    await expect(limiteur.verifier("1.2.3.4", "awa")).resolves.toBeUndefined();
  });

  it("laisse passer si Redis est indisponible (fail-open journalisé)", async () => {
    const redis = { get: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) } as unknown as Redis;

    await expect(new LimiteurConnexion(redis).verifier("1.2.3.4", "awa")).resolves.toBeUndefined();
  });
});
