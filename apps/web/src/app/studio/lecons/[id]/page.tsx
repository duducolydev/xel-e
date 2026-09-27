import "katex/dist/katex.min.css";
import type { LeconStudio } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { EditeurLecon } from "./editeur-lecon";

export const metadata: Metadata = { title: "Éditer une leçon — Xel-E" };

export default async function PageEditionLecon({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const suite = `/connexion?suite=/studio/lecons/${id}`;
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect(suite);

  const reponse = await appelerApi(`/studio/lecons/${encodeURIComponent(id)}`);
  if (reponse.status === 401) redirect(suite);
  if (reponse.status === 403) redirect("/tableau-de-bord?acces=refuse");
  if (reponse.status === 404 || reponse.status === 400) notFound();
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  const lecon = (await reponse.json()) as LeconStudio;

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <Link href="/studio" className="text-sm font-medium text-brand-dark underline underline-offset-4">
          ← Mon studio
        </Link>
        <h1 className="text-2xl font-bold text-brand-dark">{lecon.titre}</h1>
        <EditeurLecon initiale={lecon} />
      </main>
    </>
  );
}
