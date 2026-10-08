import type { AnnaleDto, ExamenResume, PageAbonnement } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { nombre } from "@/components/corrige-detaille";
import { EnteteConnecte } from "@/components/entete-connecte";
import { Alerte } from "@/components/ui";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";

export const metadata: Metadata = { title: "Préparer le BFEM — Xel-E" };

function duree(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const reste = minutes % 60;
  return `${Math.floor(minutes / 60)} h${reste ? ` ${String(reste).padStart(2, "0")}` : ""}`;
}

export default async function PageBfem() {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?suite=/bfem");

  const [reponseExamens, reponseAnnales] = await Promise.all([appelerApi("/bfem/examens"), appelerApi("/bfem/annales")]);
  if (reponseExamens.status === 401) redirect("/connexion?suite=/bfem");
  if (reponseExamens.status === 403) redirect("/tableau-de-bord?acces=refuse");
  if (!reponseExamens.ok || !reponseAnnales.ok) throw new Error(`Réponse inattendue de l'API : ${reponseExamens.status}`);
  const examens = (await reponseExamens.json()) as ExamenResume[];
  const annales = (await reponseAnnales.json()) as AnnaleDto[];
  // État Premium de l'élève : message clair si son accès a pris fin.
  const reponseAbonnement = utilisateur.role === "ELEVE" ? await appelerApi("/abonnement") : null;
  const etat = reponseAbonnement?.ok ? ((await reponseAbonnement.json()) as PageAbonnement).etat : null;
  const finPremium = etat && !etat.premium && etat.jusquau ? new Date(etat.jusquau).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Africa/Dakar" }) : null;

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-brand-dark">Préparer le BFEM</h1>
            <p className="mt-1 text-sm text-gray-600">Examens blancs chronométrés, annales et estimation de ta moyenne.</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm font-semibold">
            <Link href="/bfem/historique" className="text-brand-dark underline underline-offset-4">
              Mon historique
            </Link>
            <Link href="/bfem/simulation" className="text-brand-dark underline underline-offset-4">
              Ma moyenne simulée
            </Link>
          </div>
        </div>

        {finPremium ? (
          <Alerte ton="info">
            <span data-testid="premium-expire">
              Ton accès Premium a pris fin le {finPremium}. Les examens blancs Premium sont de nouveau verrouillés ; tes résultats et ton
              historique restent disponibles.{" "}
              <Link href="/abonnement" className="font-semibold underline">
                Renouveler Premium
              </Link>
            </span>
          </Alerte>
        ) : null}

        <section aria-labelledby="titre-examens" className="space-y-3">
          <h2 id="titre-examens" className="text-lg font-semibold text-gray-900">
            Examens blancs
          </h2>
          {examens.length === 0 ? (
            <p className="text-sm text-gray-600">Aucun examen blanc pour l&apos;instant.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {examens.map((examen) => (
                <li key={examen.slug} className="flex flex-col justify-between gap-3 rounded-xl border border-gray-200 p-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-brand-texte">{examen.epreuve.libelle}</span>
                      {examen.premium ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Premium</span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">Gratuit</span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-900">{examen.titre}</p>
                    <p className="text-sm text-gray-600">
                      {duree(examen.dureeMinutes)}
                      {examen.epreuve.aVerifier ? " (durée provisoire)" : ""} · {examen.nombreQuestions} questions · sur 20
                    </p>
                    {examen.derniereNote !== null ? (
                      <p className="text-sm text-gray-700">Dernière note : {nombre(examen.derniereNote)} / 20</p>
                    ) : null}
                  </div>
                  {examen.accessible ? (
                    <Link
                      href={examen.copieEnCours ? `/bfem/copies/${examen.copieEnCours}` : `/bfem/examens/${examen.slug}`}
                      className="self-start rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand"
                    >
                      {examen.copieEnCours ? "Reprendre ma copie" : examen.derniereNote !== null ? "Repasser l'examen" : "Voir l'examen"}
                    </Link>
                  ) : (
                    <p className="text-sm text-gray-600">
                      <span aria-hidden="true">🔒 </span>Réservé aux abonnés Premium.{" "}
                      {utilisateur.role === "ELEVE" ? (
                        <Link href="/abonnement" className="font-semibold text-brand-dark underline">
                          Passer à Premium
                        </Link>
                      ) : null}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="titre-annales" className="space-y-3">
          <h2 id="titre-annales" className="text-lg font-semibold text-gray-900">
            Annales
          </h2>
          {annales.length === 0 ? (
            <p className="text-sm text-gray-600">Les annales des sessions précédentes arrivent bientôt.</p>
          ) : (
            <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200">
              {annales.map((annale) => (
                <li key={annale.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{annale.titre}</p>
                    <p className="text-sm text-gray-600">
                      {annale.epreuve.libelle} · session {annale.annee}
                      {annale.premium ? " · Premium" : ""}
                    </p>
                  </div>
                  {annale.accessible ? (
                    <span className="flex gap-3 text-sm font-semibold">
                      <a href={`/api/bfem/annales/${annale.id}/sujet`} className="text-brand-dark underline" download>
                        Sujet (PDF)
                      </a>
                      {annale.aUnCorrige ? (
                        <a href={`/api/bfem/annales/${annale.id}/corrige`} className="text-brand-dark underline" download>
                          Corrigé (PDF)
                        </a>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-600">
                      <span aria-hidden="true">🔒 </span>Premium
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
