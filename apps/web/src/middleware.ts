import { NextResponse, type NextRequest } from "next/server";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";
const COOKIE_ACCES = "xele_access";
const COOKIE_REFRESH = "xele_refresh";

function versConnexion(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/connexion";
  url.search = `?suite=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  const reponse = NextResponse.redirect(url);
  reponse.cookies.delete(COOKIE_ACCES);
  reponse.cookies.delete(COOKIE_REFRESH);
  return reponse;
}

// Le cookie d'accès expire au bout de 15 min : on le renouvelle ici, avant le rendu,
// pour que la session continue sans que l'élève ait à se reconnecter.
export async function middleware(request: NextRequest): Promise<NextResponse> {
  if (request.cookies.has(COOKIE_ACCES)) return NextResponse.next();

  const refresh = request.cookies.get(COOKIE_REFRESH);
  if (!refresh) return versConnexion(request);

  let reponseApi: Response;
  try {
    reponseApi = await fetch(`${API_URL}/auth/rafraichir`, {
      method: "POST",
      headers: { cookie: `${COOKIE_REFRESH}=${refresh.value}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.next();
  }
  if (!reponseApi.ok) return versConnexion(request);

  const nouveauxCookies = reponseApi.headers.getSetCookie();
  for (const ligne of nouveauxCookies) {
    const paire = ligne.split(";")[0] ?? "";
    const separateur = paire.indexOf("=");
    request.cookies.set(paire.slice(0, separateur), paire.slice(separateur + 1));
  }
  const reponse = NextResponse.next({ request: { headers: request.headers } });
  for (const ligne of nouveauxCookies) reponse.headers.append("set-cookie", ligne);
  return reponse;
}

export const config = {
  matcher: [
    "/tableau-de-bord/:path*",
    "/admin/:path*",
    "/studio/:path*",
    "/cours/:niveau/:matiere/:slug/quiz",
    "/quiz/:path*",
    "/mes-quiz",
    "/classement",
  ],
};
