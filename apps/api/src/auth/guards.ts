import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@prisma/client";
import { AccessTokenService } from "./access-token.service";
import { COOKIE_ACCES } from "./cookies";
import { PUBLIC_KEY, RequeteAuthentifiee, ROLES_KEY } from "./decorators";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const estPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (estPublic) return true;

    const requete = context.switchToHttp().getRequest<RequeteAuthentifiee>();
    const token: unknown = requete.cookies?.[COOKIE_ACCES];
    const utilisateur = typeof token === "string" ? await this.accessTokens.verifier(token) : null;
    if (!utilisateur) {
      throw new UnauthorizedException("Tu dois être connecté pour accéder à cette page.");
    }
    requete.utilisateur = utilisateur;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const utilisateur = context.switchToHttp().getRequest<RequeteAuthentifiee>().utilisateur;
    if (!utilisateur) {
      throw new UnauthorizedException("Tu dois être connecté pour accéder à cette page.");
    }
    if (!roles.includes(utilisateur.role)) {
      throw new ForbiddenException("Tu n'as pas accès à cette ressource.");
    }
    return true;
  }
}
