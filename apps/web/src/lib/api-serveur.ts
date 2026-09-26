import "server-only";
import type { UtilisateurCourant } from "@xel-e/shared";
import { cookies } from "next/headers";

export const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";

// Appel de l'API depuis un composant serveur, avec les cookies de session du visiteur.
export async function appelerApi(chemin: string, init: RequestInit = {}): Promise<Response> {
  const enTetes = new Headers(init.headers);
  enTetes.set("cookie", (await cookies()).toString());
  return fetch(`${API_URL}${chemin}`, { ...init, headers: enTetes, cache: "no-store" });
}

export async function utilisateurCourant(): Promise<UtilisateurCourant | null> {
  const reponse = await appelerApi("/auth/moi");
  if (!reponse.ok) return null;
  return (await reponse.json()) as UtilisateurCourant;
}
