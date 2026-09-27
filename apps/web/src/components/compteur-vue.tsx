"use client";

import { useEffect } from "react";

// Signale la lecture pour les statistiques des professeurs ; l'API dédoublonne (un visiteur par heure).
export function CompteurVue({ slug }: { slug: string }) {
  useEffect(() => {
    void fetch(`/api/lecons/${encodeURIComponent(slug)}/vue`, { method: "POST", keepalive: true }).catch(() => undefined);
  }, [slug]);
  return null;
}
