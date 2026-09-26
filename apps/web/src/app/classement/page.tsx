import type { Classement } from "@xel-e/shared";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { ReglageClassement } from "./reglage-classement";

export const metadata: Metadata = { title: "Classement — Xel-E", robots: { index: false } };

export default async function PageClassement() {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?suite=/classement");
  if (utilisateur.role !== "ELEVE") redirect("/tableau-de-bord");

  const reponse = await appelerApi("/progression/classement");
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  const classement = (await reponse.json()) as Classement;
  const depuis = new Date(classement.debutSemaine).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Dakar",
  });

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Classement de la semaine</h1>
          <p className="mt-1 text-sm text-gray-600">
            {classement.niveau ? `Élèves de ${classement.niveau}` : "Élèves de ton niveau"} · XP gagnée depuis {depuis}.
          </p>
        </div>

        <ReglageClassement participe={classement.participe} pseudonyme={classement.pseudonyme} />

        {classement.lignes.length === 0 ? (
          <p className="text-gray-600">Personne n&apos;est encore inscrit au classement cette semaine.</p>
        ) : (
          <table className="w-full overflow-hidden rounded-xl border border-gray-200 text-left">
            <caption className="sr-only">Classement de la semaine par XP</caption>
            <thead className="bg-brand-wash text-sm text-brand-dark">
              <tr>
                <th scope="col" className="px-4 py-2">Rang</th>
                <th scope="col" className="px-4 py-2">Pseudonyme</th>
                <th scope="col" className="px-4 py-2 text-right">XP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {classement.lignes.map((ligne) => (
                <tr key={ligne.pseudonyme} className={ligne.estMoi ? "bg-amber-50 font-semibold" : ""}>
                  <td className="px-4 py-2">{ligne.rang}</td>
                  <td className="px-4 py-2">
                    {ligne.pseudonyme}
                    {ligne.estMoi ? <span className="text-xs text-gray-600"> (toi)</span> : null}
                  </td>
                  <td className="px-4 py-2 text-right">{ligne.xp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {classement.monRang && !classement.lignes.some((l) => l.estMoi) ? (
          <p className="text-sm text-gray-700">
            Ta position : {classement.monRang.rang}e avec {classement.monRang.xp} XP.
          </p>
        ) : null}
      </main>
    </>
  );
}
