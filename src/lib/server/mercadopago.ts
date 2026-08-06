import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlanId } from "@/lib/shared/plan-limits";

const MERCADO_PAGO_API = "https://api.mercadopago.com";

function mercadoPagoAccessToken() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MERCADOPAGO_NOT_CONFIGURED");
  }
  return token;
}

function preapprovalPlanIdForTier(plan: "cesta" | "cestao") {
  const envVar = plan === "cesta"
    ? process.env.MERCADOPAGO_PLAN_ID_CESTA
    : process.env.MERCADOPAGO_PLAN_ID_CESTAO;
  if (!envVar) {
    throw new Error("MERCADOPAGO_NOT_CONFIGURED");
  }
  return envVar;
}

async function mercadoPagoRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${MERCADO_PAGO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${mercadoPagoAccessToken()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`MERCADOPAGO_REQUEST_FAILED: ${response.status} ${body.slice(0, 500)}`);
  }
  return response.json() as Promise<T>;
}

export type MercadoPagoPreapproval = {
  id: string;
  status: string;
  payer_id?: number;
  payer_email?: string;
  external_reference?: string;
  preapproval_plan_id?: string;
  init_point?: string;
};

export type MercadoPagoPayment = {
  id: number;
  status: string;
  status_detail?: string;
  transaction_amount?: number;
  currency_id?: string;
  date_approved?: string | null;
};

/**
 * Cria a assinatura (preapproval) do usuário para um plano pago e retorna a
 * URL de checkout hospedado (Checkout Pro — redirecionamento, sem SDK/iframe
 * embutido, por isso não exige mudança de CSP).
 */
export async function createSubscriptionCheckout(args: {
  uid: string;
  email: string;
  plan: "cesta" | "cestao";
}): Promise<{ checkoutUrl: string; preapprovalId: string }> {
  const preapprovalPlanId = preapprovalPlanIdForTier(args.plan);
  const appUrl = process.env.APP_URL || "https://www.getgolist.com";

  const preapproval = await mercadoPagoRequest<MercadoPagoPreapproval>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      preapproval_plan_id: preapprovalPlanId,
      payer_email: args.email,
      external_reference: args.uid,
      back_url: `${appUrl}/index.html?section=profileSection&checkout=return`,
    }),
  });

  if (!preapproval.init_point) {
    throw new Error("MERCADOPAGO_MISSING_INIT_POINT");
  }

  return { checkoutUrl: preapproval.init_point, preapprovalId: preapproval.id };
}

export async function fetchPreapproval(preapprovalId: string): Promise<MercadoPagoPreapproval> {
  return mercadoPagoRequest<MercadoPagoPreapproval>(`/preapproval/${preapprovalId}`);
}

export async function fetchPayment(paymentId: string): Promise<MercadoPagoPayment> {
  return mercadoPagoRequest<MercadoPagoPayment>(`/v1/payments/${paymentId}`);
}

export async function cancelPreapproval(preapprovalId: string): Promise<void> {
  await mercadoPagoRequest(`/preapproval/${preapprovalId}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });
}

/**
 * Valida a assinatura HMAC-SHA256 dos webhooks do Mercado Pago, conforme o
 * esquema documentado (header `x-signature`: "ts=...,v1=...", manifest
 * "id:{dataId};request-id:{xRequestId};ts:{ts};"). Retorna false (nunca
 * lança) sempre que a assinatura não confere OU quando o segredo não está
 * configurado — quem chama deve tratar `false` como 401.
 */
export function verifyWebhookSignature(params: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string;
}): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret || !params.xSignature || !params.dataId) {
    return false;
  }

  const parts = Object.fromEntries(
    params.xSignature.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key?.trim(), value?.trim()];
    }),
  );
  const timestamp = parts.ts;
  const receivedHash = parts.v1;
  if (!timestamp || !receivedHash) {
    return false;
  }

  const manifest = `id:${params.dataId};request-id:${params.xRequestId || ""};ts:${timestamp};`;
  const expectedHash = createHmac("sha256", secret).update(manifest).digest("hex");

  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const receivedBuffer = Buffer.from(receivedHash, "hex");
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function planForPreapprovalPlanId(preapprovalPlanId: string | undefined): PlanId | null {
  if (!preapprovalPlanId) return null;
  if (preapprovalPlanId === process.env.MERCADOPAGO_PLAN_ID_CESTA) return "cesta";
  if (preapprovalPlanId === process.env.MERCADOPAGO_PLAN_ID_CESTAO) return "cestao";
  return null;
}
