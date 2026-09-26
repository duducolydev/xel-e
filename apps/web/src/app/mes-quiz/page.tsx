import type { ResumeTentative } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EntetePublic } from "@/components/entete-public";
import { appelerApi } from "@/lib/api-serveur";

export const metadata: Metadata = { title: "Mes quiz — Xel-E", robots: { index: false } };

function date(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Africa/Dakar" });
}

export default async function PageMesQuiz() {
  const reponse = await appelerApi("/quiz/tentatives");
  if (reponse.status === 401) redirect("/connexion?suite=/mes-quiz");
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  const tentatives = (await reponse.json()) as ResumeTentative[];

  return (
    <>
      <EntetePublic />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <h1 className="text-2xl font-bold text-brand-dark">Mes quiz</h1>
        {tentatives.length === 0 ? (
          <p className="text-gray-600">
            Tu n&apos;as pas encore fait de quiz.{" "}
            <Link href="/cours" className="text-brand-dark underline">
              Choisis une leçon
            </Link>{" "}
            pour commencer.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200">
            {tentatives.map((tentative) => {
              const cheminQuiz = `/cours/${tentative.lecon.niveau}/${tentative.lecon.matiere}/${tentative.lecon.slug}/quiz`;
              return (
                <li key={tentative.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{tentative.lecon.titre}</p>
                    <p className="text-sm text-gray-600">
                      {tentative.termineLe ? `Terminé le ${date(tentative.termineLe)}` : `Commencé le ${date(tentative.demarreLe)}`}
                    </p>
                  </div>
                  {tentative.termineLe ? (
                    <Link
                      href={`/quiz/resultats/${tentative.id}`}
                      className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 font-semibold text-brand-dark hover:bg-brand-wash"
                    >
                      {(tentative.score ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
                    </Link>
                  ) : (
                    <Link href={cheminQuiz} className="shrink-0 rounded-lg bg-brand-dark px-3 py-1.5 font-semibold text-white hover:bg-brand">
                      Reprendre
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
