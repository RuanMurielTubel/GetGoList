import { NextResponse } from "next/server";
import {
  AI_RESPONSE_SCHEMA,
  AI_SYSTEM_INSTRUCTION,
  FIREBASE_AI_ENDPOINT,
  buildAiRequestText,
  parseGeneratedText,
} from "@/lib/server/ai-list-prompt";
import { adminFirestore } from "@/lib/server/firebase-admin";
import {
  authenticatedVerifiedUser,
  verifiedAppRequest,
} from "@/lib/server/request-auth";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { limitsForPlan } from "@/lib/shared/plan-limits";

export const runtime = "nodejs";

const FIREBASE_WEB_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAFj6YWQfz3dI2motK3qH9xc0UNVF7TzqY";

export async function POST(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedVerifiedUser(request);

    if (!(await withinRateLimit(`ai-generate:${user.uid}`, 6, 10 * 60 * 1000))) {
      return NextResponse.json({ ok: false, code: "AI_LIMIT_REACHED" }, { status: 429 });
    }

    const subscriptionSnapshot = await adminFirestore()
      .collection("users")
      .doc(user.uid)
      .collection("billing")
      .doc("subscription")
      .get();
    const plan = subscriptionSnapshot.data()?.plan;
    if (!limitsForPlan(plan).hasAI) {
      return NextResponse.json({ ok: false, code: "AI_PLAN_REQUIRED" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (prompt.length < 8) {
      return NextResponse.json({ ok: false, code: "AI_EMPTY_RESULT" }, { status: 400 });
    }

    // Reencaminha exatamente as mesmas credenciais que o cliente já provou
    // nesta requisição (ID token + App Check) para o Firebase AI Logic —
    // é o mesmo esquema de auth que o navegador usava chamando direto,
    // só que agora com o gate de plano acima antes de repassar.
    const authorizationHeader = request.headers.get("authorization") || "";
    const idToken = authorizationHeader.startsWith("Bearer ")
      ? authorizationHeader.slice("Bearer ".length)
      : "";
    const appCheckToken = request.headers.get("x-firebase-appcheck") || "";

    let aiResponse: Response;
    try {
      aiResponse = await fetch(FIREBASE_AI_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Firebase ${idToken}`,
          "Content-Type": "application/json",
          "X-Firebase-AppCheck": appCheckToken,
          "x-goog-api-key": FIREBASE_WEB_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildAiRequestText(prompt) }] }],
          systemInstruction: { role: "system", parts: [{ text: AI_SYSTEM_INSTRUCTION }] },
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: AI_RESPONSE_SCHEMA,
            maxOutputTokens: 2500,
            temperature: 0.35,
          },
        }),
      });
    } catch (error) {
      console.error("Falha de rede ao chamar a IA.", error);
      return NextResponse.json({ ok: false, code: "AI_NETWORK" }, { status: 502 });
    }

    const payload = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok) {
      const codeByStatus: Record<number, string> = {
        401: "AI_DEVICE_NOT_VERIFIED",
        403: "AI_ACCESS_BLOCKED",
        404: "AI_MODEL_UNAVAILABLE",
        429: "AI_LIMIT_REACHED",
      };
      const code = codeByStatus[aiResponse.status] || "AI_TEMPORARY_ERROR";
      return NextResponse.json({ ok: false, code }, { status: aiResponse.status });
    }

    const responseText = parseGeneratedText(payload);
    if (!responseText) {
      return NextResponse.json({ ok: false, code: "AI_EMPTY_RESULT" }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ ok: false, code: "AI_EMPTY_RESULT" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, result: parsed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false, code: "AI_AUTH_REQUIRED" }, { status: 401 });
    }
    if (message === "VERIFIED_ACCOUNT_REQUIRED" || message.startsWith("APP_CHECK_")) {
      return NextResponse.json({ ok: false, code: "AI_DEVICE_NOT_VERIFIED" }, { status: 403 });
    }
    console.error("Falha ao gerar lista com IA.", error);
    return NextResponse.json({ ok: false, code: "AI_TEMPORARY_ERROR" }, { status: 500 });
  }
}
