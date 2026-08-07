import { NextResponse } from "next/server";
import {
  AI_SYSTEM_INSTRUCTION,
  DEEPSEEK_ENDPOINT,
  DEEPSEEK_MODEL,
  buildAiRequestText,
  parseGeneratedText,
  validateAiListResult,
} from "@/lib/server/ai-list-prompt";
import { adminFirestore } from "@/lib/server/firebase-admin";
import {
  authenticatedVerifiedUser,
  verifiedAppRequest,
} from "@/lib/server/request-auth";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { effectivePlan, limitsForPlan } from "@/lib/shared/plan-limits";

export const runtime = "nodejs";

function deepSeekApiKey() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error("DEEPSEEK_NOT_CONFIGURED");
  }
  return key;
}

type AiAttemptResult =
  | { ok: true; result: ReturnType<typeof validateAiListResult> }
  | { ok: false; code: string; status: number };

async function requestAiList(prompt: string): Promise<AiAttemptResult> {
  let aiResponse: Response;
  try {
    aiResponse = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deepSeekApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: AI_SYSTEM_INSTRUCTION },
          { role: "user", content: buildAiRequestText(prompt) },
        ],
        response_format: { type: "json_object" },
        max_tokens: 2500,
        temperature: 0.35,
      }),
    });
  } catch (error) {
    console.error("Falha de rede ao chamar a IA.", error);
    return { ok: false, code: "AI_NETWORK", status: 502 };
  }

  const payload = await aiResponse.json().catch(() => ({}));
  if (!aiResponse.ok) {
    const codeByStatus: Record<number, string> = {
      401: "AI_ACCESS_BLOCKED",
      403: "AI_ACCESS_BLOCKED",
      404: "AI_MODEL_UNAVAILABLE",
      429: "AI_LIMIT_REACHED",
    };
    return { ok: false, code: codeByStatus[aiResponse.status] || "AI_TEMPORARY_ERROR", status: aiResponse.status };
  }

  const responseText = parseGeneratedText(payload);
  if (!responseText) {
    console.warn("Resposta da IA sem texto extraível.", JSON.stringify(payload).slice(0, 500));
    return { ok: false, code: "AI_EMPTY_RESULT", status: 502 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    console.warn("Resposta da IA não é um JSON válido.", responseText.slice(0, 500));
    return { ok: false, code: "AI_EMPTY_RESULT", status: 502 };
  }

  const result = validateAiListResult(parsed);
  if (!result) {
    console.warn("Resposta da IA não bateu com o formato esperado.", responseText.slice(0, 500));
    return { ok: false, code: "AI_EMPTY_RESULT", status: 502 };
  }

  return { ok: true, result };
}

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
    const plan = effectivePlan(subscriptionSnapshot.data()?.plan, user.email);
    if (!limitsForPlan(plan).hasAI) {
      return NextResponse.json({ ok: false, code: "AI_PLAN_REQUIRED" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (prompt.length < 8) {
      return NextResponse.json({ ok: false, code: "AI_EMPTY_RESULT" }, { status: 400 });
    }

    // O modelo ocasionalmente foge do formato pedido (sampling não é
    // determinístico); uma segunda tentativa resolve a maioria desses casos
    // sem expor o usuário a um erro por uma falha passageira. Erros de
    // auth/rede/limite não se beneficiam de retry, então saem direto.
    let attempt = await requestAiList(prompt);
    if (!attempt.ok && attempt.code === "AI_EMPTY_RESULT") {
      attempt = await requestAiList(prompt);
    }

    if (!attempt.ok) {
      return NextResponse.json({ ok: false, code: attempt.code }, { status: attempt.status });
    }

    return NextResponse.json({ ok: true, result: attempt.result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false, code: "AI_AUTH_REQUIRED" }, { status: 401 });
    }
    if (message === "VERIFIED_ACCOUNT_REQUIRED" || message.startsWith("APP_CHECK_")) {
      return NextResponse.json({ ok: false, code: "AI_DEVICE_NOT_VERIFIED" }, { status: 403 });
    }
    if (message === "DEEPSEEK_NOT_CONFIGURED") {
      return NextResponse.json({ ok: false, code: "AI_NOT_CONFIGURED" }, { status: 503 });
    }
    console.error("Falha ao gerar lista com IA.", error);
    return NextResponse.json({ ok: false, code: "AI_TEMPORARY_ERROR" }, { status: 500 });
  }
}
