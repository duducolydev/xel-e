import "server-only";
import { API_URL } from "./api-serveur";

export const SITE_URL = process.env.APP_URL ?? "http://localhost:3010";

// Lecture des contenus publiés : aucun cookie transmis, la réponse est la même pour tous.
export async function lirePublic<T>(chemin: string): Promise<T | null> {
  const reponse = await fetch(`${API_URL}${chemin}`, { cache: "no-store" });
  if (reponse.status === 404) return null;
  if (!reponse.ok) throw new Error(`API ${chemin} : ${reponse.status}`);
  return (await reponse.json()) as T;
}
