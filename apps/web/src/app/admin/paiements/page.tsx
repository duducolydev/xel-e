import type { PlanDto } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { CycleAbonnements, LignePlan } from "./gestion";

export const metadata: Metadata = { title: "Offres et paiements — Administration Xel-E" };

export default async function PageAdminPaiements() {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?suite=/admin/paiements");
  const reponse = await appelerApi("/admin/plans");
  if (reponse.status === 401) redirect("/connexion?suite=/admin/paiements");
  if (reponse.status === 403) redirect("/tableau-de-bord?acces=refuse");
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  const plans = (await reponse.json()) as (PlanDto & { actif: boolean })[];

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        <Link href="/admin" className="text-sm font-medium text-brand-dark underline underline-offset-4">
          ← Administration
        </Link>
        <h1 className="text-2xl font-bold text-brand-dark">Offres et paiements</h1>
        <section aria-labelledby="titre-offres" className="space-y-3">
          <h2 id="titre-offres" className="text-lg font-semibold text-gray-900">
            Offres Premium
          </h2>
          <p className="text-sm text-gray-600">Les prix marqués « à confirmer » sont provisoires. Un nouveau prix s&apos;applique aux paiements suivants.</p>
          <ul className="space-y-2">
            {plans.map((plan) => (
              <LignePlan key={plan.code} plan={plan} />
            ))}
          </ul>
        </section>
        <CycleAbonnements />
      </main>
    </>
  );
}
