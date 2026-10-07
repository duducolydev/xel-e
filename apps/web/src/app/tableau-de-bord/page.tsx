import type { TableauDeBordProgression } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { Alerte } from "@/components/ui";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { ProgressionEleve } from "./progression-eleve";

export const metadata: Metadata = { title: "Tableau de bord — Xel-E" };

export default async function PageTableauDeBord({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?suite=/tableau-de-bord");
  const { acces } = await searchParams;
  const prenom = utilisateur.nomComplet.split(" ")[0];
  const reponseProgression = utilisateur.role === "ELEVE" ? await appelerApi("/progression/tableau-de-bord") : null;
  const progression = reponseProgression?.ok ? ((await reponseProgression.json()) as TableauDeBordProgression) : null;

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {acces === "refuse" ? (
          <Alerte ton="erreur">Tu n&apos;as pas accès à cette page.</Alerte>
        ) : null}

        <h1 className="text-2xl font-bold text-brand-dark">Bonjour {prenom} !</h1>

        {utilisateur.email && !utilisateur.emailConfirme ? (
          <Alerte ton="info">
            Pense à confirmer ton adresse email : ouvre le lien reçu à{" "}
            <strong>{utilisateur.email}</strong>.
          </Alerte>
        ) : null}

        {utilisateur.consentementParentalRequis && !utilisateur.consentementParentalDonne ? (
          <Alerte ton="info">
            Ton parent n&apos;a pas encore donné son accord. Le forum s&apos;ouvrira dès qu&apos;il
            l&apos;aura fait ; tes cours sont déjà accessibles.
          </Alerte>
        ) : null}

        {progression ? <ProgressionEleve tableau={progression} /> : null}

        {utilisateur.role === "PROFESSEUR" ? (
          <section className="rounded-xl border border-brand-light bg-brand-wash p-5">
            <h2 className="font-semibold text-brand-dark">Mon studio</h2>
            <p className="mt-1 text-sm text-gray-700">
              Rédige des leçons et leurs quiz, suis leur relecture et leurs statistiques.
            </p>
            <Link href="/studio" className="mt-3 inline-block font-semibold text-brand-dark underline underline-offset-4">
              Ouvrir mon studio
            </Link>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900">Mes cours</h2>
            <p className="mt-1 text-sm text-gray-600">
              {utilisateur.niveau
                ? `Les leçons de Maths, PC et SVT de la classe de ${utilisateur.niveau}.`
                : "Les leçons de Maths, PC et SVT, de la 6e à la 3e."}
            </p>
            <Link
              href={utilisateur.niveau ? `/cours/${utilisateur.niveau}` : "/cours"}
              className="mt-3 inline-block font-semibold text-brand-dark underline underline-offset-4"
            >
              Voir les cours
            </Link>
            <Link href="/mes-quiz" className="ml-4 mt-3 inline-block font-semibold text-brand-dark underline underline-offset-4">
              Mes quiz
            </Link>
            {utilisateur.role === "ELEVE" ? (
              <Link href="/classement" className="ml-4 mt-3 inline-block font-semibold text-brand-dark underline underline-offset-4">
                Classement
              </Link>
            ) : null}
          </div>
          <div className="rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900">Forum d&apos;entraide</h2>
            <p className="mt-1 text-sm text-gray-600" data-testid="statut-forum">
              {utilisateur.accesForum
                ? "Ton accès au forum est ouvert."
                : "Ton accès au forum n'est pas encore ouvert."}
            </p>
            {utilisateur.role !== "PARENT" ? (
              <Link href="/forum" className="mt-3 inline-block font-semibold text-brand-dark underline underline-offset-4">
                Ouvrir le forum
              </Link>
            ) : null}
          </div>
        </section>
      </main>
    </>
  );
}
