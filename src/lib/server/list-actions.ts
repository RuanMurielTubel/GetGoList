// Ações de edição (adicionar/remover/editar/mover/limpar item) que tanto o
// comando de voz quanto o chat de texto podem gerar. Compartilhado pelos
// dois prompts (voice-command-prompt.ts e ai-list-prompt.ts) para não
// duplicar o schema e a validação em dois lugares.
//
// Módulo "base": não importa de ai-list-prompt.ts nem voice-command-prompt.ts
// (os dois importam daqui) para evitar dependência circular entre os três.

export type ItemUnit = "un" | "kg" | "L";

export function normalizeItemUnit(value: unknown): ItemUnit {
  return value === "kg" || value === "L" ? value : "un";
}

export type ListAction =
  | { type: "add"; name: string; quantity: number; unit: ItemUnit; sector: string }
  | { type: "remove"; name: string }
  | { type: "edit"; name: string; newName?: string; sector?: string; quantity?: number; unit?: ItemUnit }
  | { type: "move"; name: string; toList: string }
  | { type: "clear" };

// Descrição do schema de ações reaproveitada nos dois prompts, pra manter a
// definição do que cada tipo de ação significa igual nos dois lugares.
export const LIST_ACTION_SCHEMA_INSTRUCTION = [
  'Cada ação é um destes formatos:',
  '{"type":"add","name":string,"quantity":number positivo,"unit":"un"|"kg"|"L","sector":string} — inclui um produto novo.',
  '{"type":"remove","name":string} — remove um produto pelo nome dito pelo usuário.',
  '{"type":"edit","name":string,"newName"?:string,"sector"?:string,"quantity"?:number,"unit"?:"un"|"kg"|"L"} — altera nome, categoria e/ou quantidade de um produto já existente; "name" é como o usuário se referiu ao item (pra localizá-lo), "newName" só quando o pedido for trocar/renomear.',
  '{"type":"move","name":string,"toList":string} — move um produto da lista de origem para outra lista existente do usuário (nome em "toList" deve ser um dos nomes de lista informados).',
  '{"type":"clear"} — esvazia a lista inteira.',
  'Uma única mensagem pode conter vários pedidos — gere uma ação separada para cada um, na ordem em que foram ditos.',
  'Converta números por extenso em dígitos (ex.: "duas" vira 2). Quando a quantidade não for dita, use 1.',
  'Em "add", cada item tem uma unidade: "kg" para carnes, frutas, verduras e legumes tipicamente vendidos por peso, "L" para líquidos vendidos a granel por volume, e "un" (contagem, sempre inteiro) para o restante.',
  'Organize cada produto de "add" em um setor de supermercado coerente, como Hortifruti, Açougue, Bebidas, Padaria, Limpeza, Higiene Pessoal, Congelados, Mercearia, Descartáveis ou Geral — dando preferência aos setores que já aparecem na lista de destino, quando fizerem sentido.',
].join(" ");

export type ListItemSnapshot = { name: string; sector: string };

// Recorte leve (só nome + setor) dos itens da lista aberta, mandado junto
// do pedido pra IA poder decidir reorganizações em massa ("bota tudo no
// setor certo") — sem isso ela não tem como saber quais itens existem.
export function sanitizeListItemSnapshot(value: unknown): ListItemSnapshot[] {
  if (!Array.isArray(value)) return [];
  const items: ListItemSnapshot[] = [];
  for (const raw of value.slice(0, 120)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { name?: unknown; sector?: unknown };
    if (typeof item.name !== "string" || !item.name.trim()) continue;
    items.push({
      name: item.name.slice(0, 120),
      sector: typeof item.sector === "string" && item.sector.trim() ? item.sector.slice(0, 60) : "Geral",
    });
  }
  return items;
}

export function validateListActions(value: unknown): ListAction[] | null {
  if (!Array.isArray(value)) return null;

  const actions: ListAction[] = [];
  for (const rawAction of value.slice(0, 120)) {
    if (!rawAction || typeof rawAction !== "object") continue;
    const action = rawAction as {
      type?: unknown;
      name?: unknown;
      newName?: unknown;
      sector?: unknown;
      quantity?: unknown;
      unit?: unknown;
      toList?: unknown;
    };

    if (action.type === "clear") {
      actions.push({ type: "clear" });
      continue;
    }

    if (action.type === "remove") {
      if (typeof action.name !== "string" || !action.name.trim()) continue;
      actions.push({ type: "remove", name: action.name.slice(0, 120) });
      continue;
    }

    if (action.type === "add") {
      if (typeof action.name !== "string" || !action.name.trim()) continue;
      const quantity =
        typeof action.quantity === "number" && Number.isFinite(action.quantity) && action.quantity > 0
          ? action.quantity
          : 1;
      const sector = typeof action.sector === "string" && action.sector.trim() ? action.sector.slice(0, 60) : "Geral";
      actions.push({
        type: "add",
        name: action.name.slice(0, 120),
        quantity,
        unit: normalizeItemUnit(action.unit),
        sector,
      });
      continue;
    }

    if (action.type === "edit") {
      if (typeof action.name !== "string" || !action.name.trim()) continue;
      const newName = typeof action.newName === "string" && action.newName.trim() ? action.newName.slice(0, 120) : undefined;
      const sector = typeof action.sector === "string" && action.sector.trim() ? action.sector.slice(0, 60) : undefined;
      const quantity =
        typeof action.quantity === "number" && Number.isFinite(action.quantity) && action.quantity > 0
          ? action.quantity
          : undefined;
      const unit = typeof action.unit === "string" ? normalizeItemUnit(action.unit) : undefined;
      if (!newName && !sector && quantity === undefined) continue;
      actions.push({ type: "edit", name: action.name.slice(0, 120), newName, sector, quantity, unit });
      continue;
    }

    if (action.type === "move") {
      if (typeof action.name !== "string" || !action.name.trim()) continue;
      if (typeof action.toList !== "string" || !action.toList.trim()) continue;
      actions.push({ type: "move", name: action.name.slice(0, 120), toList: action.toList.slice(0, 80) });
    }
  }

  return actions;
}
