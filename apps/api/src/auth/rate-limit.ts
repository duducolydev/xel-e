import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import Redis from "ioredis";
import { REDIS_CLIENT } from "../redis/redis.module";

export const MESSAGE_TROP_DE_TENTATIVES = "Trop de tentatives. Réessaie dans quelques minutes.";

export const MAX_ECHECS_CONNEXION = 5;
export const FENETRE_ECHECS_CONNEXION_S = 15 * 60;

export interface LimiteDebit {
  nom: string;
  max: number;
  fenetreSecondes: number;
}

const LIMITE_DEBIT_KEY = "limite-debit";

// Limites par IP volontairement larges : une classe entière peut partager une seule IP publique.
export const LimiterDebit = (limite: LimiteDebit) => SetMetadata(LIMITE_DEBIT_KEY, limite);

function tropDeTentatives(retryAfterSecondes: number): HttpException {
  return new HttpException(
    { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: MESSAGE_TROP_DE_TENTATIVES, retryAfterSecondes },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const limite = this.reflector.get<LimiteDebit | undefined>(LIMITE_DEBIT_KEY, context.getHandler());
    if (!limite) return true;

    const http = context.switchToHttp();
    const requete = http.getRequest<Request>();
    const cle = `rl:${limite.nom}:${requete.ip ?? "inconnue"}`;
    try {
      const [[, compte], [, ttl]] = (await this.redis
        .multi()
        .incr(cle)
        .ttl(cle)
        .exec()) as [[null, number], [null, number]];
      if (ttl < 0) await this.redis.expire(cle, limite.fenetreSecondes);
      if (compte > limite.max) {
        const attente = ttl > 0 ? ttl : limite.fenetreSecondes;
        http.getResponse<Response>().setHeader("Retry-After", String(attente));
        throw tropDeTentatives(attente);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`Limiteur indisponible, requête laissée passer : ${(error as Error).message}`);
    }
    return true;
  }
}

// Compte les échecs de connexion par (IP, identifiant) : 5 échecs, puis 429 pendant 15 minutes.
@Injectable()
export class LimiteurConnexion {
  private readonly logger = new Logger(LimiteurConnexion.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private cle(ip: string, login: string): string {
    return `rl:echecs-connexion:${ip}:${login}`;
  }

  async verifier(ip: string, login: string): Promise<void> {
    try {
      const cle = this.cle(ip, login);
      const echecs = Number(await this.redis.get(cle));
      if (echecs >= MAX_ECHECS_CONNEXION) {
        const ttl = await this.redis.ttl(cle);
        throw tropDeTentatives(ttl > 0 ? ttl : FENETRE_ECHECS_CONNEXION_S);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`Limiteur indisponible : ${(error as Error).message}`);
    }
  }

  async enregistrerEchec(ip: string, login: string): Promise<void> {
    try {
      const cle = this.cle(ip, login);
      await this.redis.multi().incr(cle).expire(cle, FENETRE_ECHECS_CONNEXION_S, "NX").exec();
    } catch (error) {
      this.logger.warn(`Limiteur indisponible : ${(error as Error).message}`);
    }
  }

  async reinitialiser(ip: string, login: string): Promise<void> {
    try {
      await this.redis.del(this.cle(ip, login));
    } catch (error) {
      this.logger.warn(`Limiteur indisponible : ${(error as Error).message}`);
    }
  }
}
