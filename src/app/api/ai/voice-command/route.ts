import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/server/firebase-admin";
import {
  authenticatedVerifiedUser,
  verifiedAppRequest,
} from "@/lib/server/request-auth";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { effectivePlan, limitsForPlan } from "@/lib/shared/plan-limits";
import {
  DEEPSEEK_ENDPOINT,
  DEEPSEEK_MODEL,
  VOICE_COMMAND_SYSTEM_INSTRUCTION,
  buildVoiceCommandRequestText,
  parseGeneratedText,
  validateVoiceReply,
  type VoiceReply,
} from "@/lib/server/voice-command-prompt";

export const runtime = "nodejs";

function deepSeekApiKey() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error("DEEPSEEK_NOT_CONFIGURED");
  }
  return key;
}

type VoiceAttemptResult =
  | { ok: true; reply: VoiceReply }
  | { ok: false; code: string; status: number };

async function requestVoiceActions(
  transcript: string,
  context: { listNames: string[]; currentListName?: string },
): Promise<VoiceAttemptResult> {
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
          { role: "system", content: VOICE_COMMAND_SYSTEM_INSTRUCTION },
          { role: "user", content: buildVoiceCommandRequestText(transcript, context) },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1200,
        temperature: 0.2,
      }),
    });
  } catch (error) {
    console.error("Falha de rede ao chamar a IA de voz.", error);
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
    console.warn("Resposta da IA de voz sem texto extraível.", JSON.stringify(payload).slice(0, 500));
    return { ok: false, code: "AI_EMPTY_RESULT", status: 502 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    console.warn("Resposta da IA de voz não é um JSON válido.", responseText.slice(0, 500));
    return { ok: false, code: "AI_EMPTY_RESULT", status: 502 };
  }

  const reply = validateVoiceReply(parsed);
  if (!reply) {
    console.warn("Resposta da IA de voz não bateu com o formato esperado.", responseText.slice(0, 500));
    return { ok: false, code: "AI_EMPTY_RESULT", status: 502 };
  }

  return { ok: true, reply };
}

export async function POST(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedVerifiedUser(request);

    if (!(await withinRateLimit(`voice-command:${user.uid}`, 20, 10 * 60 * 1000))) {
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
    const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
    if (transcript.length < 2) {
      return NextResponse.json({ ok: false, code: "AI_EMPTY_RESULT" }, { status: 400 });
    }
    const listNames = Array.isArray(body.listNames)
      ? body.listNames.filter((name: unknown): name is string => typeof name === "string" && name.trim().length > 0)
      : [];
    const currentListName = typeof body.currentListName === "string" ? body.currentListName : undefined;
    const context = { listNames, currentListName };

    // O modelo ocasionalmente foge do formato pedido; uma segunda
    // tentativa resolve a maioria dos casos sem expor o usuário a um
    // erro por uma falha passageira.
    let attempt = await requestVoiceActions(transcript, context);
    if (!attempt.ok && attempt.code === "AI_EMPTY_RESULT") {
      attempt = await requestVoiceActions(transcript, context);
    }

    if (!attempt.ok) {
      return NextResponse.json({ ok: false, code: attempt.code }, { status: attempt.status });
    }

    return NextResponse.json({ ok: true, result: attempt.reply });
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
    console.error("Falha ao interpretar comando de voz.", error);
    return NextResponse.json({ ok: false, code: "AI_TEMPORARY_ERROR" }, { status: 500 });
  }
}
