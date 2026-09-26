import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-brand-wash to-white px-6 text-center">
      <h1>
        <Image src="/logo-xele.png" alt="Xel-E" width={120} height={176} priority />
      </h1>
      <p className="max-w-md text-base text-gray-700">
        Plateforme e-learning pour les collégiens sénégalais — Maths, Physique-Chimie, SVT.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-3 sm:max-w-md sm:flex-row">
        <Link
          href="/inscription"
          className="flex-1 rounded-lg bg-brand-dark px-4 py-3 font-semibold text-white hover:bg-brand"
        >
          Créer un compte
        </Link>
        <Link
          href="/connexion"
          className="flex-1 rounded-lg border border-brand-dark px-4 py-3 font-semibold text-brand-dark hover:bg-brand-wash"
        >
          Se connecter
        </Link>
      </div>
      <Link href="/cours" className="font-semibold text-brand-dark underline underline-offset-4">
        Découvrir les cours
      </Link>
    </main>
  );
}
