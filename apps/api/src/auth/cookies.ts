import type { CookieOptions, Response } from "express";

export const COOKIE_ACCES = "xele_access";
export const COOKIE_REFRESH = "xele_refresh";

export interface JetonsSession {
  accessToken: string;
  accessTtlSecondes: number;
  refreshToken: string;
  refreshExpireLe: Date;
}

function options(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure, path: "/" };
}

// Le cookie disparaît avant le JWT : le front rafraîchit la session pendant que le JWT est encore valide,
// ce qui évite qu'il expire au milieu d'un rendu serveur.
export function dureeCookieAccesSecondes(ttlSecondes: number): number {
  return ttlSecondes - Math.min(30, Math.floor(ttlSecondes / 2));
}

export function definirCookiesSession(res: Response, jetons: JetonsSession, secure: boolean): void {
  res.cookie(COOKIE_ACCES, jetons.accessToken, {
    ...options(secure),
    maxAge: dureeCookieAccesSecondes(jetons.accessTtlSecondes) * 1000,
  });
  res.cookie(COOKIE_REFRESH, jetons.refreshToken, {
    ...options(secure),
    expires: jetons.refreshExpireLe,
  });
}

export function effacerCookiesSession(res: Response, secure: boolean): void {
  res.clearCookie(COOKIE_ACCES, options(secure));
  res.clearCookie(COOKIE_REFRESH, options(secure));
}
