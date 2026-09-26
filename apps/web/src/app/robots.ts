import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/api-public";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/tableau-de-bord", "/confirmer-email", "/consentement-parental", "/reinitialiser-mot-de-passe"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
