import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { BoutonValider } from "./bouton-valider";

export const metadata: Metadata = { title: "Administration — Xel-E" };

interface ProfesseurEnAttente {
  id: string;
  nomComplet: string;
  email: string | null;
  createdAt: string;
}

export default async function PageAdmin() {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?suite=/admin");

  // L'API fait autorité sur les droits : c'est son 403 qui déclenche la redirection.
  const reponse = await appelerApi("/admin/professeurs/en-attente");
  if (reponse.status === 401) redirect("/connexion?suite=/admin");
  if (reponse.status === 403) redirect("/tableau-de-bord?acces=refuse");
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  const professeurs = (await reponse.json()) as ProfesseurEnAttente[];

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <h1 className="text-2xl font-bold text-brand-dark">Administration</h1>
        <p>
          <Link href="/admin/revue" className="font-semibold text-brand-dark underline underline-offset-4">
            Leçons à relire
          </Link>
          {" · "}
          <Link href="/admin/moderation" className="font-semibold text-brand-dark underline underline-offset-4">
            Modération du forum
          </Link>
          {" · "}
          <Link href="/admin/bfem" className="font-semibold text-brand-dark underline underline-offset-4">
            Module BFEM
          </Link>
          {" · "}
          <Link href="/admin/paiements" className="font-semibold text-brand-dark underline underline-offset-4">
            Offres et paiements
          </Link>
        </p>
        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Professeurs en attente de validation</h2>
          {professeurs.length === 0 ? (
            <p className="text-sm text-gray-600">Aucun compte professeur en attente.</p>
          ) : (
            <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200">
              {professeurs.map((prof) => (
                <li key={prof.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{prof.nomComplet}</p>
                    <p className="text-sm text-gray-600">{prof.email}</p>
                  </div>
                  <BoutonValider id={prof.id} nom={prof.nomComplet} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
