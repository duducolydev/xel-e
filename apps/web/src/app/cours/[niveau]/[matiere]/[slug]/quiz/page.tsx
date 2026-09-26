import type { EtatTentative, QuizPublic } from "@xel-e/shared";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EntetePublic } from "@/components/entete-public";
import { FilAriane } from "@/components/fil-ariane";
import { appelerApi } from "@/lib/api-serveur";
import { ParcoursQuiz } from "./parcours-quiz";

export const metadata: Metadata = { title: "Quiz — Xel-E", robots: { index: false } };

type Params = Promise<{ niveau: string; matiere: string; slug: string }>;

export default async function PageQuiz({ params }: { params: Params }) {
  const { niveau, matiere, slug } = await params;
  const chemin = `/cours/${niveau}/${matiere}/${slug}`;

  const reponseQuiz = await appelerApi(`/quiz/lecons/${encodeURIComponent(slug)}`);
  if (reponseQuiz.status === 401) redirect(`/connexion?suite=${encodeURIComponent(`${chemin}/quiz`)}`);
  if (reponseQuiz.status === 404) notFound();
  if (!reponseQuiz.ok) throw new Error(`Réponse inattendue de l'API : ${reponseQuiz.status}`);
  const quiz = (await reponseQuiz.json()) as QuizPublic;

  const reponseTentative = await appelerApi(`/quiz/lecons/${encodeURIComponent(slug)}/tentative-en-cours`);
  const { tentative } = reponseTentative.ok
    ? ((await reponseTentative.json()) as { tentative: EtatTentative | null })
    : { tentative: null };

  return (
    <>
      <EntetePublic />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <FilAriane
          etapes={[
            { libelle: "Cours", href: "/cours" },
            { libelle: quiz.lecon.niveau, href: `/cours/${quiz.lecon.niveau}` },
            { libelle: quiz.lecon.titre, href: chemin },
            { libelle: "Quiz" },
          ]}
        />
        <h1 className="text-2xl font-bold text-brand-dark">Quiz : {quiz.lecon.titre}</h1>
        <ParcoursQuiz quiz={quiz} tentativeInitiale={tentative} cheminLecon={chemin} />
      </main>
    </>
  );
}
