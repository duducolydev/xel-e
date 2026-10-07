import "server-only";
import type { EtatForum, UtilisateurCourant } from "@xel-e/shared";
import { notFound, redirect } from "next/navigation";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";

// Session, état du forum pour ce compte, puis la ressource demandée (null si le forum est fermé).
export async function chargerForum<T>(
  chemin: string | null,
  suite: string,
): Promise<{ utilisateur: UtilisateurCourant; etat: EtatForum; donnees: T | null }> {
  const connexion = `/connexion?suite=${encodeURIComponent(suite)}`;
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect(connexion);

  const reponseEtat = await appelerApi("/forum/etat");
  if (reponseEtat.status === 401) redirect(connexion);
  if (reponseEtat.status === 403) redirect("/tableau-de-bord?acces=refuse");
  if (!reponseEtat.ok) throw new Error(`Réponse inattendue de l'API : ${reponseEtat.status}`);
  const etat = (await reponseEtat.json()) as EtatForum;
  if (!etat.acces || chemin === null) return { utilisateur, etat, donnees: null };

  const reponse = await appelerApi(chemin);
  if (reponse.status === 404 || reponse.status === 400) notFound();
  if (reponse.status === 401) redirect(connexion);
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  return { utilisateur, etat, donnees: (await reponse.json()) as T };
}
