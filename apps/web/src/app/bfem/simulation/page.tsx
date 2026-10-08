import type { SimulationBfem } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { FormulaireSimulation } from "./formulaire";

export const metadata: Metadata = { title: "Ma moyenne simulée au BFEM — Xel-E" };

export default async function PageSimulation() {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?suite=/bfem/simulation");
  const reponse = await appelerApi("/bfem/simulation");
  if (reponse.status === 401) redirect("/connexion?suite=/bfem/simulation");
  if (reponse.status === 403) redirect("/tableau-de-bord?acces=refuse");
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  const simulation = (await reponse.json()) as SimulationBfem;

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <Link href="/bfem" className="text-sm font-medium text-brand-dark underline underline-offset-4">
          ← Préparer le BFEM
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Ma moyenne simulée</h1>
          <p className="mt-1 text-sm text-gray-600">
            Les notes de Maths, PC et SVT viennent de ton dernier examen blanc. Pour les autres épreuves, indique la note
            que tu penses obtenir. Ce n&apos;est qu&apos;une estimation, pas un résultat officiel.
          </p>
        </div>
        <FormulaireSimulation initiale={simulation} />
      </main>
    </>
  );
}
