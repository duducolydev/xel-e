import type { ElementModeration, TermeInterditDto } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { dateHeure } from "../../forum/affichage";
import { ActionsModeration, GestionTermes } from "./actions";

export const metadata: Metadata = { title: "Modération du forum — Xel-E" };

const ROLES: Record<string, string> = { ELEVE: "élève", PROFESSEUR: "professeur", ADMIN: "administration", PARENT: "parent" };

export default async function PageModeration() {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?suite=/admin/moderation");

  const [reponseFile, reponseTermes] = await Promise.all([appelerApi("/admin/moderation"), appelerApi("/admin/moderation/termes")]);
  if (reponseFile.status === 401) redirect("/connexion?suite=/admin/moderation");
  if (reponseFile.status === 403) redirect("/tableau-de-bord?acces=refuse");
  if (!reponseFile.ok || !reponseTermes.ok) throw new Error(`Réponse inattendue de l'API : ${reponseFile.status}`);
  const file = (await reponseFile.json()) as ElementModeration[];
  const termes = (await reponseTermes.json()) as TermeInterditDto[];

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        <Link href="/admin" className="text-sm font-medium text-brand-dark underline underline-offset-4">
          ← Administration
        </Link>
        <h1 className="text-2xl font-bold text-brand-dark">Modération du forum</h1>

        <section aria-labelledby="titre-file" className="space-y-3">
          <h2 id="titre-file" className="text-lg font-semibold text-gray-900">
            Messages signalés
          </h2>
          {file.length === 0 ? (
            <p className="text-sm text-gray-600">Aucun message en attente de modération.</p>
          ) : (
            <ul className="space-y-3">
              {file.map((element) => (
                <li key={element.messageId} className="space-y-2 rounded-xl border border-gray-200 p-4" data-testid="element-moderation">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Link href={`/forum/sujets/${element.sujet.id}`} className="font-medium text-brand-dark underline">
                      {element.sujet.titre}
                    </Link>
                    <span className="flex gap-2">
                      {element.etat === "masque" ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Masqué</span>
                      ) : null}
                      {element.verifie ? (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">Déjà vérifié</span>
                      ) : null}
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                        {element.signalements} signalement{element.signalements > 1 ? "s" : ""}
                      </span>
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {element.auteur.pseudonyme ?? "sans pseudonyme"} ({element.auteur.nomComplet}, {ROLES[element.auteur.role] ?? element.auteur.role}) ·
                    dernier signalement le {dateHeure(element.dernierSignalementLe)}
                  </p>
                  <blockquote className="whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-gray-900">{element.contenu}</blockquote>
                  {element.piecesJointes.length > 0 ? (
                    <p className="text-sm">
                      Pièces jointes :{" "}
                      {element.piecesJointes.map((piece) => (
                        <a key={piece.id} href={`/api/forum/pieces-jointes/${piece.id}`} target="_blank" rel="noopener" className="mr-2 text-brand-dark underline">
                          {piece.nom}
                        </a>
                      ))}
                    </p>
                  ) : null}
                  {element.motifs.length > 0 ? (
                    <p className="text-sm text-gray-700">Motifs : {element.motifs.join(" · ")}</p>
                  ) : null}
                  <ActionsModeration messageId={element.messageId} sujetId={element.sujet.id} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <GestionTermes termes={termes} />
      </main>
    </>
  );
}
