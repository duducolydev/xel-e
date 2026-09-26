import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Role } from "@prisma/client";
import type { Env } from "../config/env";
import type { UtilisateurAuthentifie } from "./decorators";

interface AccessPayload {
  sub: string;
  role: Role;
}

@Injectable()
export class AccessTokenService {
  readonly ttlSecondes: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlSecondes = config.get("JWT_ACCESS_TTL_SECONDS", { infer: true });
  }

  signer(utilisateur: UtilisateurAuthentifie): Promise<string> {
    const payload: AccessPayload = { sub: utilisateur.id, role: utilisateur.role };
    return this.jwt.signAsync(payload, { expiresIn: this.ttlSecondes });
  }

  async verifier(token: string): Promise<UtilisateurAuthentifie | null> {
    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token);
      return { id: payload.sub, role: payload.role };
    } catch {
      return null;
    }
  }
}
