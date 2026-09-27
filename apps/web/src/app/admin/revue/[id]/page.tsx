import "katex/dist/katex.min.css";
import type { LeconStudio, SectionLecon } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApercuLecon } from "@/components/apercu-lecon";
import { EnteteConnecte } from "@/components/entete-connecte";
import { QuizCorrige } from "@/components/quiz-corrige";
import { Alerte } from "@/components/ui";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { BadgeStatut, dateCourte } from "../../../studio/commun";
import { DecisionRevue } from "./decision-revue";

export const metadata: Metadata = { title: "Relecture — Xel-E" };

export default async function PageRelecture({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const suite = `/connexion?suite=/admin/revue/${id}`;
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect(suite);
  if (utilisateur.role !== "ADMIN") redirect("/tableau-de-bord?acces=refuse");

  const [reponseLecon, reponseApercu] = await Promise.all([
    appelerApi(`/studio/lecons/${encodeURIComponent(id)}`),
    appelerApi(`/admin/lecons/${encodeURIComponent(id)}/apercu`),
  ]);
  if (reponseLecon.status === 401) redirect(suite);
  if (reponseLecon.status === 403 || reponseApercu.status === 403) redirect("/tableau-de-bord?acces=refuse");
  if (reponseLecon.status === 404 || reponseLecon.status === 400) notFound();
  if (!reponseLecon.ok || !reponseApercu.ok) throw new Error(`Réponse inattendue de l'API : ${reponseLecon.status}`);
  const lecon = (await reponseLecon.json()) as LeconStudio;
  const { sections } = (await reponseApercu.json()) as { sections: SectionLecon[] };

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <Link href="/admin/revue" className="text-sm font-medium text-brand-dark underline underline-offset-4">
          ← Leçons à relire
        </Link>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-brand-dark">{lecon.titre}</h1>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {lecon.niveau} · {lecon.matiere} · {lecon.chapitre} · par {lecon.auteur ?? "l'équipe"}
              {lecon.soumisLe ? `, soumise le ${dateCourte(lecon.soumisLe)}` : ""}
            </p>
            <BadgeStatut statut={lecon.statut} version={lecon.version} />
          </div>
        </div>

        {lecon.statut !== "EN_REVUE" ? (
          <Alerte ton="info">Cette leçon n&apos;est pas (ou plus) en attente de relecture.</Alerte>
        ) : null}

        {lecon.commentaires.length > 0 ? (
          <section aria-labelledby="titre-historique" className="rounded-xl border border-gray-200 p-4">
            <h2 id="titre-historique" className="font-semibold text-gray-900">
              Refus précédents
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              {lecon.commentaires.map((commentaire) => (
                <li key={commentaire.createdAt}>
                  {dateCourte(commentaire.createdAt)} — {commentaire.contenu}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="titre-cours" className="space-y-3">
          <h2 id="titre-cours" className="text-lg font-semibold text-gray-900">
            Cours (rendu élève)
          </h2>
          <div className="rounded-xl border border-gray-200 p-5">
            <ApercuLecon sections={sections} />
          </div>
        </section>

        <section aria-labelledby="titre-quiz-revue" className="space-y-3">
          <h2 id="titre-quiz-revue" className="text-lg font-semibold text-gray-900">
            Quiz{lecon.modificationsQuizEnCours ? "" : " (inchangé)"}
          </h2>
          <QuizCorrige quiz={lecon.quiz} />
        </section>

        {lecon.statut === "EN_REVUE" ? <DecisionRevue id={lecon.id} titre={lecon.titre} /> : null}
      </main>
    </>
  );
}
