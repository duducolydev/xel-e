import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: "./",
    include: ["test/**/*.e2e-spec.ts"],
    // Les specs e2e partagent une seule vraie base Postgres (certaines la
    // réinitialisent entièrement) : elles doivent s'exécuter en séquence,
    // jamais en parallèle entre fichiers.
    fileParallelism: false,
    // Le premier démarrage du moteur de requêtes Prisma (binaire natif) peut
    // être lent sur certaines machines (antivirus qui scanne l'exécutable
    // au premier lancement) : marge large pour rester fiable localement.
    testTimeout: 60000,
    hookTimeout: 60000,
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
