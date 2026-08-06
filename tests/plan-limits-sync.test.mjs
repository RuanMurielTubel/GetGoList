import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// public/app.js é um script clássico sem bundler, então PLAN_LIMITS é
// copiado manualmente ali a partir de src/lib/shared/plan-limits.ts. Este
// teste extrai os dois literais como texto (sem executar app.js, que
// depende de DOM) e garante que não divergiram.
function extractObjectLiteral(source, constantName) {
  const pattern = new RegExp(`const ${constantName}\\s*(?::[^=]+)?=\\s*({[\\s\\S]*?});`);
  const match = source.match(pattern);
  assert.ok(match, `Não encontrei "const ${constantName} = {...}" no arquivo`);
  return new Function(`return (${match[1]})`)();
}

// Só os campos presentes nas duas cópias são comparados — plan-limits.ts
// também guarda priceCents, que app.js não precisa conhecer.
const SHARED_FIELDS = ["maxLists", "canShare", "hasAI", "hasGestao", "showAds"];

function pickSharedFields(limits) {
  const result = {};
  for (const plan of Object.keys(limits)) {
    result[plan] = {};
    for (const field of SHARED_FIELDS) {
      result[plan][field] = limits[plan][field];
    }
  }
  return result;
}

test("PLAN_LIMITS em public/app.js está em sincronia com src/lib/shared/plan-limits.ts", async () => {
  const [appJsSource, planLimitsSource] = await Promise.all([
    readFile(path.join(rootDir, "public", "app.js"), "utf8"),
    readFile(path.join(rootDir, "src", "lib", "shared", "plan-limits.ts"), "utf8"),
  ]);

  const appJsLimits = extractObjectLiteral(appJsSource, "PLAN_LIMITS");
  const sharedLimits = extractObjectLiteral(planLimitsSource, "PLAN_LIMITS");

  assert.deepEqual(
    pickSharedFields(appJsLimits),
    pickSharedFields(sharedLimits),
    "PLAN_LIMITS em public/app.js divergiu de src/lib/shared/plan-limits.ts — atualize os dois.",
  );
});

// COMPLIMENTARY_CESTAO_EMAILS é replicado em três lugares que não podem
// importar uns aos outros (app.js sem bundler, firestore.rules com
// linguagem própria) — este teste garante que os três continuam iguais.
function extractArrayLiteral(source, constantName) {
  const pattern = new RegExp(`${constantName}\\s*(?::[^=]+)?=\\s*(\\[[\\s\\S]*?\\])`);
  const match = source.match(pattern);
  assert.ok(match, `Não encontrei "${constantName} = [...]" no arquivo`);
  return new Function(`return (${match[1]})`)();
}

test("COMPLIMENTARY_CESTAO_EMAILS está em sincronia entre plan-limits.ts, app.js e firestore.rules", async () => {
  const [appJsSource, planLimitsSource, rulesSource] = await Promise.all([
    readFile(path.join(rootDir, "public", "app.js"), "utf8"),
    readFile(path.join(rootDir, "src", "lib", "shared", "plan-limits.ts"), "utf8"),
    readFile(path.join(rootDir, "firestore.rules"), "utf8"),
  ]);

  const canonical = extractArrayLiteral(planLimitsSource, "COMPLIMENTARY_CESTAO_EMAILS").sort();
  const appJsList = extractArrayLiteral(appJsSource, "COMPLIMENTARY_CESTAO_EMAILS").sort();

  const rulesMatch = rulesSource.match(/isComplimentaryCestao\(email\)\s*{\s*return email in (\[[\s\S]*?\]);/);
  assert.ok(rulesMatch, "Não encontrei isComplimentaryCestao(email) em firestore.rules");
  const rulesList = new Function(`return (${rulesMatch[1]})`)().sort();

  assert.deepEqual(appJsList, canonical, "COMPLIMENTARY_CESTAO_EMAILS em public/app.js divergiu de plan-limits.ts.");
  assert.deepEqual(rulesList, canonical, "COMPLIMENTARY_CESTAO_EMAILS em firestore.rules divergiu de plan-limits.ts.");
});
