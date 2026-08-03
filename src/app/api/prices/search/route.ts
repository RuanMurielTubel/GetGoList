import { NextResponse } from "next/server";
import {
  authenticatedVerifiedUser,
  normalizedText,
  verifiedAppRequest,
} from "@/lib/server/request-auth";
import { withinRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

type MercadoLivreSearchItem = {
  id?: unknown;
  title?: unknown;
  price?: unknown;
  currency_id?: unknown;
  condition?: unknown;
  permalink?: unknown;
  thumbnail?: unknown;
  shipping?: { free_shipping?: unknown };
  seller?: { nickname?: unknown };
};

function safeMarketplaceLink(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      !(hostname === "mercadolivre.com.br" || hostname.endsWith(".mercadolivre.com.br"))
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function safeProductImage(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.replace(/^http:/, "https:"));
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !hostname.endsWith(".mlstatic.com")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function priceNumber(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export async function POST(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedVerifiedUser(request);
    if (!(await withinRateLimit(`price-search:${user.uid}`, 30, 15 * 60 * 1000))) {
      return NextResponse.json(
        { code: "PRICE_SEARCH_LIMIT", message: "Aguarde alguns minutos antes de pesquisar novamente." },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const query = normalizedText(body?.query, 80);
    if (query.length < 2) {
      return NextResponse.json(
        { code: "INVALID_QUERY", message: "Digite o nome de um produto." },
        { status: 400 },
      );
    }

    const accessToken = process.env.MERCADO_LIVRE_ACCESS_TOKEN?.trim();
    if (!accessToken) {
      return NextResponse.json(
        {
          code: "PRICE_PROVIDER_NOT_CONFIGURED",
          message: "A primeira fonte de preços está aguardando a conexão segura.",
        },
        { status: 503 },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    let providerResponse: Response;
    try {
      const searchUrl = new URL("https://api.mercadolibre.com/sites/MLB/search");
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("sort", "price_asc");
      searchUrl.searchParams.set("limit", "12");
      providerResponse = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!providerResponse.ok) {
      const status = providerResponse.status;
      return NextResponse.json(
        {
          code: status === 401 || status === 403
            ? "PRICE_PROVIDER_AUTH_REQUIRED"
            : "PRICE_PROVIDER_UNAVAILABLE",
          message: status === 401 || status === 403
            ? "A conexão com a fonte de preços precisa ser renovada."
            : "A fonte de preços está temporariamente indisponível.",
        },
        { status: status === 429 ? 429 : 502 },
      );
    }

    const payload = await providerResponse.json().catch(() => ({}));
    const sourceItems = Array.isArray(payload?.results)
      ? payload.results as MercadoLivreSearchItem[]
      : [];
    const offers = sourceItems
      .map((item) => ({
        id: normalizedText(item.id, 40),
        title: normalizedText(item.title, 180),
        price: priceNumber(item.price),
        currency: normalizedText(item.currency_id, 6, "BRL"),
        condition: normalizedText(item.condition, 20),
        link: safeMarketplaceLink(item.permalink),
        image: safeProductImage(item.thumbnail),
        store: normalizedText(item.seller?.nickname, 80, "Mercado Livre"),
        freeShipping: item.shipping?.free_shipping === true,
      }))
      .filter((offer) => offer.id && offer.title && offer.price && offer.link)
      .sort((first, second) => first.price - second.price)
      .slice(0, 8);

    return NextResponse.json(
      {
        query,
        source: "Mercado Livre",
        location: { city: "Joinville", state: "SC", scope: "Brasil" },
        offers,
        queriedAt: new Date().toISOString(),
      },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    }
    if (message === "VERIFIED_ACCOUNT_REQUIRED" || message.startsWith("APP_CHECK_")) {
      return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
    }
    if (message.includes("NOT_CONFIGURED")) {
      return NextResponse.json({ code: "SERVER_NOT_CONFIGURED" }, { status: 503 });
    }
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { code: "PRICE_PROVIDER_TIMEOUT", message: "A pesquisa demorou demais. Tente novamente." },
        { status: 504 },
      );
    }
    console.error("Falha ao pesquisar preços online.", error);
    return NextResponse.json(
      { code: "PRICE_SEARCH_FAILED", message: "Não foi possível pesquisar preços agora." },
      { status: 500 },
    );
  }
}
