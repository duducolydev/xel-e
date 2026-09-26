import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Role } from "@prisma/client";
import type { Request } from "express";

export interface UtilisateurAuthentifie {
  id: string;
  role: Role;
}

export type RequeteAuthentifiee = Request & { utilisateur?: UtilisateurAuthentifie };

export const PUBLIC_KEY = "public";
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const ROLES_KEY = "roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UtilisateurAuthentifie | undefined =>
    context.switchToHttp().getRequest<RequeteAuthentifiee>().utilisateur,
);
