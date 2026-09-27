import type { ChapitreStudio, TableauStudio } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { PanneauNotifications } from "@/components/notifications";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { BadgeStatut, dateCourte } from "./commun";
import { NouvelleLecon } from "./nouvelle-lecon";

export const metadata: Metadata = { title: "Mon studio — Xel-E" };

function pourcentage(valeur: number | null): string {
  return valeur === null ? "—" : `${valeur.toLocaleString("fr-FR")} %`;
}

export default async function PageStudio() {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?suite=/studio");

  // L'API fait autorité sur les droits : c'est son 403 qui déclenche la redirection.
  const reponse = await appelerApi("/studio");
  if (reponse.status === 401) redirect("/connexion?suite=/studio");
  if (reponse.status === 403) redirect("/tableau-de-bord?acces=refuse");
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  const tableau = (await reponse.json()) as TableauStudio;
  const chapitres = (await (await appelerApi("/studio/chapitres")).json()) as ChapitreStudio[];
  const { statistiques } = tableau;

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Mon studio</h1>
          <p className="mt-1 text-sm text-gray-600">
            Rédige tes leçons et leurs quiz, puis soumets-les : l&apos;équipe Xel-E les relit avant publication.
          </p>
        </div>

        <PanneauNotifications notifications={tableau.notifications} nonLues={tableau.notificationsNonLues} />

        <NouvelleLecon chapitres={chapitres} />

        <section aria-labelledby="titre-mes-lecons" className="space-y-3">
          <h2 id="titre-mes-lecons" className="text-lg font-semibold text-gray-900">
            Mes leçons
          </h2>
          {tableau.lecons.length === 0 ? (
            <p className="text-sm text-gray-600">Tu n&apos;as encore rédigé aucune leçon.</p>
          ) : (
            <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200">
              {tableau.lecons.map((lecon) => (
                <li key={lecon.id} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/studio/lecons/${lecon.id}`} className="font-medium text-brand-dark underline-offset-4 hover:underline">
                      {lecon.titre}
                    </Link>
                    <BadgeStatut statut={lecon.statut} version={lecon.version} />
                  </div>
                  <p className="text-sm text-gray-600">
                    {lecon.niveau} · {lecon.matiere} · {lecon.chapitre} · modifiée le {dateCourte(lecon.majLe)}
                  </p>
                  {lecon.dernierCommentaire ? (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <span className="font-semibold">À corriger : </span>
                      {lecon.dernierCommentaire}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="titre-statistiques" className="space-y-3">
          <h2 id="titre-statistiques" className="text-lg font-semibold text-gray-900">
            Statistiques de mes leçons en ligne
          </h2>
          {statistiques.lecons.length === 0 ? (
            <p className="text-sm text-gray-600">Les statistiques apparaîtront dès qu&apos;une de tes leçons sera publiée.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-semibold">Leçon</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold">Vues</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold">Quiz passés</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold">Taux de réussite</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold">Score moyen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {statistiques.lecons.map((ligne) => (
                    <tr key={ligne.slug}>
                      <th scope="row" className="px-4 py-2 font-medium text-gray-900">{ligne.titre}</th>
                      <td className="px-4 py-2 text-right">{ligne.vues}</td>
                      <td className="px-4 py-2 text-right">{ligne.tentatives}</td>
                      <td className="px-4 py-2 text-right">{pourcentage(ligne.tauxReussite)}</td>
                      <td className="px-4 py-2 text-right">{ligne.scoreMoyen === null ? "—" : `${ligne.scoreMoyen.toLocaleString("fr-FR")} / 100`}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold text-gray-900">
                  <tr>
                    <th scope="row" className="px-4 py-2">Total</th>
                    <td className="px-4 py-2 text-right">{statistiques.total.vues}</td>
                    <td className="px-4 py-2 text-right">{statistiques.total.tentatives}</td>
                    <td className="px-4 py-2 text-right">{pourcentage(statistiques.total.tauxReussite)}</td>
                    <td className="px-4 py-2 text-right">
                      {statistiques.total.scoreMoyen === null ? "—" : `${statistiques.total.scoreMoyen.toLocaleString("fr-FR")} / 100`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="text-xs text-gray-500">
            Une vue = un visiteur par heure. Le taux de réussite compte les quiz terminés par des élèves avec au moins 60 %.
          </p>
        </section>
      </main>
    </>
  );
}
