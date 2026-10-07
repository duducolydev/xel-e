"use client";

import { useEffect } from "react";

const INTERVALLE_MS = 60_000;

// Temps d'activité : un signal par minute tant que la page est au premier plan (élèves connectés
// uniquement ; pour les autres l'API répond 401/403 et le signal s'arrête aussitôt).
export function SignalPresence() {
  useEffect(() => {
    let actif = true;
    async function signaler() {
      if (!actif || document.visibilityState !== "visible") return;
      try {
        const reponse = await fetch("/api/activite/presence", { method: "POST", credentials: "same-origin" });
        if (reponse.status === 401 || reponse.status === 403) actif = false;
      } catch {
        // Hors ligne : on réessaiera à la minute suivante.
      }
    }
    void signaler();
    const minuterie = window.setInterval(signaler, INTERVALLE_MS);
    return () => {
      actif = false;
      window.clearInterval(minuterie);
    };
  }, []);
  return null;
}
