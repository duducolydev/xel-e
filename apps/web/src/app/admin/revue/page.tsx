import type { ResumeLeconStudio } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { Alerte } from "@/components/ui";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { dateCourte } from "../../studio/commun";

export const metadata: Metadata = { title: "Leçons à relire — Xel-E" };

const DECISIONS: Record<string, string> = {
  publiee: "Leçon publiée : son auteur a été prévenu.",
  refusee: "Leçon renvoyée en brouillon : son auteur a reçu ton commentaire.",
};

export default async function PageFileDeRevue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { decision } = await searchParams;
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?suite=/admin/revue");

  const reponse = await appelerApi("/admin/revue");
  if (reponse.status === 401) redirect("/connexion?suite=/admin/revue");
  if (reponse.status === 403) redirect("/tableau-de-bord?acces=refuse");
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  const lecons = (await reponse.json()) as ResumeLeconStudio[];

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <Link href="/admin" className="text-sm font-medium text-brand-dark underline underline-offset-4">
          ← Administration
        </Link>
        <h1 className="text-2xl font-bold text-brand-dark">Leçons à relire</h1>
        {typeof decision === "string" && DECISIONS[decision] ? <Alerte ton="succes">{DECISIONS[decision]}</Alerte> : null}
        {lecons.length === 0 ? (
          <p className="text-sm text-gray-600">Aucune leçon en attente de relecture.</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200">
            {lecons.map((lecon) => (
              <li key={lecon.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{lecon.titre}</p>
                  <p className="text-sm text-gray-600">
                    {lecon.niveau} · {lecon.matiere} · {lecon.chapitre} · par {lecon.auteur ?? "l'équipe"}
                    {lecon.soumisLe ? `, soumise le ${dateCourte(lecon.soumisLe)}` : ""}
                    {lecon.version > 0 ? ` · mise à jour de la v${lecon.version}` : ""}
                  </p>
                </div>
                <Link
                  href={`/admin/revue/${lecon.id}`}
                  className="rounded-lg bg-brand-dark px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand"
                  aria-label={`Relire « ${lecon.titre} »`}
                >
                  Relire
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
