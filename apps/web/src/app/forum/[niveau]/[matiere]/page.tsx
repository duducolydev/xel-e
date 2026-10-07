import type { PageForum } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { EnteteConnecte } from "@/components/entete-connecte";
import { Auteur, dateHeure, ForumFerme } from "../../affichage";
import { FormulaireMessage } from "../../interactions";
import { chargerForum } from "../../serveur";

export const metadata: Metadata = { title: "Forum d'entraide — Xel-E" };

export default async function PageForumMatiere({ params }: { params: Promise<{ niveau: string; matiere: string }> }) {
  const { niveau, matiere } = await params;
  const { utilisateur, etat, donnees: page } = await chargerForum<PageForum>(
    `/forum/niveaux/${encodeURIComponent(niveau)}/${encodeURIComponent(matiere)}`,
    `/forum/${niveau}/${matiere}`,
  );

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <Link href="/forum" className="text-sm font-medium text-brand-dark underline underline-offset-4">
          ← Forum
        </Link>
        {!page ? (
          <ForumFerme etat={etat} />
        ) : (
          <>
            <h1 className="text-2xl font-bold text-brand-dark">
              {page.matiere.nom} · {page.niveau}
            </h1>
            <section aria-labelledby="titre-sujets" className="space-y-3">
              <h2 id="titre-sujets" className="text-lg font-semibold text-gray-900">
                Questions
              </h2>
              {page.sujets.length === 0 ? (
                <p className="text-sm text-gray-600">Aucune question pour l&apos;instant : lance la discussion !</p>
              ) : (
                <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200">
                  {page.sujets.map((sujet) => (
                    <li key={sujet.id} className="space-y-1 px-4 py-3">
                      <Link href={`/forum/sujets/${sujet.id}`} className="font-medium text-brand-dark underline-offset-4 hover:underline">
                        {sujet.titre}
                      </Link>
                      <p className="flex flex-wrap items-center gap-x-3 text-sm text-gray-600">
                        <Auteur auteur={sujet.auteur} />
                        <span>
                          {sujet.nombreReponses} réponse{sujet.nombreReponses > 1 ? "s" : ""} · dernière activité le{" "}
                          {dateHeure(sujet.dernierMessageLe)}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="titre-nouvelle-question" className="rounded-xl border border-gray-200 p-5">
              <h2 id="titre-nouvelle-question" className="mb-3 font-semibold text-gray-900">
                Poser une question
              </h2>
              {etat.pseudonyme ? (
                <FormulaireMessage niveau={page.niveau} matiere={page.matiere.libelle} />
              ) : (
                <p className="text-sm text-gray-700">
                  <Link href="/forum" className="font-medium text-brand-dark underline">
                    Choisis d&apos;abord ton pseudonyme
                  </Link>{" "}
                  pour participer.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
