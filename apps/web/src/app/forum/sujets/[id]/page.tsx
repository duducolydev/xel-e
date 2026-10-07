import type { SujetForumDetail } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { EnteteConnecte } from "@/components/entete-connecte";
import { ForumFerme, MessageForum } from "../../affichage";
import { FormulaireMessage } from "../../interactions";
import { chargerForum } from "../../serveur";

export const metadata: Metadata = { title: "Forum d'entraide — Xel-E" };

export default async function PageSujet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { utilisateur, etat, donnees: sujet } = await chargerForum<SujetForumDetail>(
    `/forum/sujets/${encodeURIComponent(id)}`,
    `/forum/sujets/${id}`,
  );

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {!sujet ? (
          <ForumFerme etat={etat} />
        ) : (
          <>
            <Link
              href={`/forum/${sujet.niveau}/${sujet.matiere.slug}`}
              className="text-sm font-medium text-brand-dark underline underline-offset-4"
            >
              ← {sujet.matiere.nom} · {sujet.niveau}
            </Link>
            <h1 className="text-2xl font-bold text-brand-dark">{sujet.titre}</h1>
            <ol className="space-y-3">
              {sujet.messages.map((message) => (
                <li key={message.id}>
                  <MessageForum message={message} />
                </li>
              ))}
            </ol>
            <section aria-labelledby="titre-repondre" className="rounded-xl border border-gray-200 p-5">
              <h2 id="titre-repondre" className="mb-3 font-semibold text-gray-900">
                Répondre
              </h2>
              {etat.pseudonyme ? (
                <FormulaireMessage sujetId={sujet.id} />
              ) : (
                <p className="text-sm text-gray-700">
                  <Link href="/forum" className="font-medium text-brand-dark underline">
                    Choisis d&apos;abord ton pseudonyme
                  </Link>{" "}
                  pour répondre.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
