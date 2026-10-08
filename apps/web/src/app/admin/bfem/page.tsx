import type { AnnaleDto, EpreuveDto, ExamenAdmin } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { AccorderPremium, EditeurExamens, GestionAnnales, TableauEpreuves } from "./gestion";

export const metadata: Metadata = { title: "BFEM — Administration Xel-E" };

export default async function PageAdminBfem() {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?suite=/admin/bfem");

  const [reponseExamens, reponseEpreuves, reponseAnnales] = await Promise.all([
    appelerApi("/admin/bfem/examens"),
    appelerApi("/bfem/epreuves"),
    appelerApi("/bfem/annales"),
  ]);
  if (reponseExamens.status === 401) redirect("/connexion?suite=/admin/bfem");
  if (reponseExamens.status === 403) redirect("/tableau-de-bord?acces=refuse");
  if (!reponseExamens.ok || !reponseEpreuves.ok || !reponseAnnales.ok) throw new Error("Réponse inattendue de l'API.");
  const examens = (await reponseExamens.json()) as ExamenAdmin[];
  const epreuves = (await reponseEpreuves.json()) as EpreuveDto[];
  const annales = (await reponseAnnales.json()) as AnnaleDto[];

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-4xl space-y-10 px-4 py-8">
        <Link href="/admin" className="text-sm font-medium text-brand-dark underline underline-offset-4">
          ← Administration
        </Link>
        <h1 className="text-2xl font-bold text-brand-dark">Module BFEM</h1>
        <TableauEpreuves epreuves={epreuves} />
        <EditeurExamens examens={examens} epreuves={epreuves.filter((e) => e.matiere !== null)} />
        <GestionAnnales annales={annales} epreuves={epreuves} />
        <AccorderPremium />
      </main>
    </>
  );
}
