import { INFOS_MATIERES, NIVEAUX } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { EnteteConnecte } from "@/components/entete-connecte";
import { ForumFerme } from "./affichage";
import { ChoixPseudonyme } from "./interactions";
import { chargerForum } from "./serveur";

export const metadata: Metadata = { title: "Forum d'entraide — Xel-E" };

export default async function PageForum() {
  const { utilisateur, etat } = await chargerForum(null, "/forum");
  // La classe de l'élève d'abord, puis les autres.
  const niveaux = [...NIVEAUX].sort((a, b) => Number(b === etat.niveau) - Number(a === etat.niveau));

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Forum d&apos;entraide</h1>
          <p className="mt-1 text-sm text-gray-600">
            Pose tes questions et aide les autres, dans le respect de la{" "}
            <Link href="/forum/charte" className="font-medium text-brand-dark underline">
              charte du forum
            </Link>
            .
          </p>
        </div>
        {!etat.acces ? (
          <ForumFerme etat={etat} />
        ) : (
          <>
            {etat.pseudonyme ? (
              <p className="text-sm text-gray-700">
                Tu participes sous le pseudonyme <strong>{etat.pseudonyme}</strong>.
              </p>
            ) : (
              <ChoixPseudonyme />
            )}
            <div className="space-y-4">
              {niveaux.map((niveau) => (
                <section key={niveau} aria-labelledby={`forum-${niveau}`} className="rounded-xl border border-gray-200 p-4">
                  <h2 id={`forum-${niveau}`} className="font-semibold text-gray-900">
                    {niveau}
                    {niveau === etat.niveau ? <span className="ml-2 text-sm font-normal text-gray-500">(ta classe)</span> : null}
                  </h2>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {Object.values(INFOS_MATIERES).map((matiere) => (
                      <li key={matiere.slug}>
                        <Link
                          href={`/forum/${niveau}/${matiere.slug}`}
                          className="inline-block rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-brand-dark hover:border-brand hover:bg-brand-wash"
                        >
                          {matiere.nom} {niveau}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
