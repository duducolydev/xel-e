import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { Alerte } from "@/components/ui";
import { utilisateurCourant } from "@/lib/api-serveur";

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

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900">Mes cours</h2>
            <p className="mt-1 text-sm text-gray-600">Les cours arrivent très bientôt sur Xel-E.</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900">Forum d&apos;entraide</h2>
            <p className="mt-1 text-sm text-gray-600" data-testid="statut-forum">
              {utilisateur.accesForum
                ? "Ton accès au forum est ouvert."
                : "Ton accès au forum n'est pas encore ouvert."}
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
