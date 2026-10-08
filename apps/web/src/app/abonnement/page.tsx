import { formaterFcfa, type PageAbonnement } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { Alerte } from "@/components/ui";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { BoutonPayer } from "./bouton-payer";

export const metadata: Metadata = { title: "Mon abonnement — Xel-E" };

const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Africa/Dakar" });
const STATUTS = { EN_ATTENTE: "En attente", CONFIRME: "Payé", ECHOUE: "Échoué" } as const;
const FOURNISSEURS: Record<string, string> = { WAVE: "Wave", ORANGE_MONEY: "Orange Money", SIMULE: "Simulé (test)" };

export default async function PageMonAbonnement({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { beneficiaire } = await searchParams;
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?suite=/abonnement");

  const reponse = await appelerApi(`/abonnement${typeof beneficiaire === "string" ? `?beneficiaire=${encodeURIComponent(beneficiaire)}` : ""}`);
  if (reponse.status === 401) redirect("/connexion?suite=/abonnement");
  if (reponse.status === 403 && utilisateur.role !== "PARENT") redirect("/tableau-de-bord?acces=refuse");
  const erreur = reponse.ok ? null : ((await reponse.json()) as { message?: string }).message ?? "Page indisponible.";
  const page = reponse.ok ? ((await reponse.json()) as PageAbonnement) : null;

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <h1 className="text-2xl font-bold text-brand-dark">Mon abonnement</h1>
        {!page ? (
          <Alerte ton="info">
            {erreur}{" "}
            {utilisateur.role === "PARENT" ? (
              <Link href="/parent" className="font-semibold underline">
                Aller à l&apos;espace parent
              </Link>
            ) : null}
          </Alerte>
        ) : (
          <>
            {page.enfants.length > 1 ? (
              <nav aria-label="Choisir l'enfant" className="flex flex-wrap gap-2">
                {page.enfants.map((enfant) => (
                  <Link
                    key={enfant.id}
                    href={`/abonnement?beneficiaire=${enfant.id}`}
                    aria-current={enfant.id === page.beneficiaire.id ? "page" : undefined}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium ${enfant.id === page.beneficiaire.id ? "border-brand-dark bg-brand-dark text-white" : "border-gray-300 text-brand-dark"}`}
                  >
                    {enfant.nomComplet}
                  </Link>
                ))}
              </nav>
            ) : null}

            <section aria-labelledby="titre-etat" className={`rounded-2xl border p-5 ${page.etat.premium ? "border-green-200 bg-green-50" : "border-gray-200"}`}>
              <h2 id="titre-etat" className="font-semibold text-gray-900">
                {utilisateur.role === "PARENT" ? page.beneficiaire.nomComplet : "Ton accès"}
              </h2>
              {page.etat.premium ? (
                <p className="mt-1 text-gray-800" data-testid="etat-abonnement">
                  <strong>Premium</strong> jusqu&apos;au {date(page.etat.jusquau!)}.{" "}
                  {page.etat.aRenouveler ? "Pense à renouveler pour ne pas perdre l'accès." : ""}
                </p>
              ) : (
                <p className="mt-1 text-gray-800" data-testid="etat-abonnement">
                  <strong>Gratuit</strong> : cours, quiz, forum, annales gratuites et premier examen blanc de chaque matière.
                  {page.etat.jusquau ? ` Ton accès Premium a pris fin le ${date(page.etat.jusquau)} ; tes résultats restent disponibles.` : ""}
                </p>
              )}
            </section>

            <section aria-labelledby="titre-offres" className="space-y-3">
              <h2 id="titre-offres" className="text-lg font-semibold text-gray-900">
                {page.etat.premium ? "Prolonger Premium" : "Passer à Premium"}
              </h2>
              <p className="text-sm text-gray-600">
                Premium ouvre tous les examens blancs du BFEM et les annales Premium.
                {page.etat.premium ? " La nouvelle période commence à la fin de l'actuelle : aucun jour perdu." : ""}
              </p>
              {page.moyens.length === 0 ? (
                <Alerte ton="info">Le paiement en ligne n&apos;est pas encore disponible.</Alerte>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {page.plans.map((plan) => (
                    <div key={plan.code} className="space-y-3 rounded-xl border border-gray-200 p-4">
                      <div>
                        <p className="font-semibold text-gray-900">{plan.libelle}</p>
                        <p className="text-2xl font-bold text-brand-dark">{formaterFcfa(plan.prixFcfa)}</p>
                        <p className="text-sm text-gray-600">{plan.dureeMois === 1 ? "pour 1 mois" : `pour ${plan.dureeMois} mois`}</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        {page.moyens.map((moyen) => (
                          <BoutonPayer
                            key={moyen.code}
                            plan={plan.code}
                            fournisseur={moyen.code}
                            beneficiaireId={utilisateur.role === "PARENT" ? page.beneficiaire.id : undefined}
                            libelle={`Payer ${formaterFcfa(plan.prixFcfa)} avec ${moyen.libelle}`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="titre-historique" className="space-y-3">
              <h2 id="titre-historique" className="text-lg font-semibold text-gray-900">
                Mes paiements
              </h2>
              {page.paiements.length === 0 ? (
                <p className="text-sm text-gray-600">Aucun paiement pour l&apos;instant.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-semibold">Date</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Offre</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Montant</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Statut</th>
                        <th scope="col" className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {page.paiements.map((paiement) => (
                        <tr key={paiement.id}>
                          <td className="px-3 py-2">{date(paiement.confirmeLe ?? paiement.creeLe)}</td>
                          <td className="px-3 py-2">
                            {paiement.plan.libelle}
                            <span className="block text-xs text-gray-500">
                              {paiement.beneficiaire} · {FOURNISSEURS[paiement.fournisseur] ?? paiement.fournisseur}
                            </span>
                          </td>
                          <td className="px-3 py-2">{formaterFcfa(paiement.montant)}</td>
                          <td className="px-3 py-2">{STATUTS[paiement.statut]}</td>
                          <td className="px-3 py-2 text-right">
                            {paiement.numeroRecu ? (
                              <a href={`/api/paiements/${paiement.id}/recu`} download className="font-semibold text-brand-dark underline">
                                Reçu {paiement.numeroRecu}
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
