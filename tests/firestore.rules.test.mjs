import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const projectId = "demo-getgolist-security";
const listId = "A1b2C3d4E5f6G7h8I9j0";
let environment;

function account(uid, email, emailVerified = true) {
  return environment.authenticatedContext(uid, {
    email,
    email_verified: emailVerified,
  }).firestore();
}

function sharedList(overrides = {}) {
  return {
    owner: "owner-user",
    ownerEmail: "owner@getgolist.com",
    allowedEmails: ["owner@getgolist.com", "guest@getgolist.com"],
    linkAccess: true,
    sharingEnded: false,
    endedAt: null,
    participantEmails: [],
    participants: {},
    lists: {
      Mercado: {
        items: [],
        history: [],
        sectorOrder: [],
        balance: 100,
        initialBalance: 100,
      },
    },
    currentListName: "Mercado",
    ...overrides,
  };
}

async function seedSubscription(uid, plan) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .doc(`users/${uid}/billing/subscription`)
      .set({ plan, status: "active" });
  });
}

async function seedLists(uid, lists, currentListName) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .doc(`users/${uid}/appData/lists`)
      .set({ lists, currentListName });
  });
}

function listsOfSize(count) {
  const lists = {};
  for (let index = 0; index < count; index += 1) {
    lists[`Lista ${index}`] = { items: [], history: [], balance: 0, initialBalance: 0 };
  }
  return lists;
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
});

after(async () => {
  await environment.cleanup();
});

test("dados privados só podem ser acessados pelo próprio usuário verificado", async () => {
  const owner = account("owner-user", "owner@getgolist.com");
  const other = account("other-user", "other@getgolist.com");
  const unverified = account("owner-user", "owner@getgolist.com", false);
  const reference = doc(owner, "users/owner-user/appData/lists");

  await assertSucceeds(setDoc(reference, { lists: {}, currentListName: "Lista 1" }));
  await assertSucceeds(getDoc(reference));
  await assertFails(getDoc(doc(other, "users/owner-user/appData/lists")));
  await assertFails(getDoc(doc(unverified, "users/owner-user/appData/lists")));
});

test("somente o proprietário pode criar uma lista em seu próprio nome", async () => {
  await seedSubscription("owner-user", "cesta");
  await seedSubscription("attacker-user", "cesta");
  const owner = account("owner-user", "owner@getgolist.com");
  const attacker = account("attacker-user", "attacker@getgolist.com");

  await assertSucceeds(
    setDoc(doc(owner, "sharedLists", listId), sharedList()),
  );
  await assertFails(
    setDoc(
      doc(attacker, "sharedLists", "Z9y8X7w6V5u4T3s2R1q0"),
      sharedList(),
    ),
  );
});

test("colaboradores editam conteúdo, mas não controlam permissões", async () => {
  await seedSubscription("owner-user", "cesta");
  const owner = account("owner-user", "owner@getgolist.com");
  const guest = account("guest-user", "guest@getgolist.com");
  const outsider = account("outsider-user", "outsider@getgolist.com");
  const unverified = account("outsider-user", "outsider@getgolist.com", false);
  const ownerReference = doc(owner, "sharedLists", listId);

  await assertSucceeds(setDoc(ownerReference, sharedList()));
  await assertSucceeds(getDoc(doc(guest, "sharedLists", listId)));
  await assertSucceeds(getDoc(doc(outsider, "sharedLists", listId)));
  await assertFails(getDoc(doc(unverified, "sharedLists", listId)));

  await assertSucceeds(
    updateDoc(doc(guest, "sharedLists", listId), {
      lists: sharedList().lists,
      currentListName: "Mercado",
    }),
  );
  await assertFails(
    updateDoc(doc(guest, "sharedLists", listId), {
      allowedEmails: ["guest@getgolist.com"],
    }),
  );
  await assertFails(
    updateDoc(doc(guest, "sharedLists", listId), { sharingEnded: true }),
  );
  await assertFails(
    updateDoc(doc(guest, "sharedLists", listId), {
      participantEmails: ["attacker@getgolist.com"],
    }),
  );
});

test("colaborador não pode renomear a lista nem mudar o orçamento, só o dono pode", async () => {
  await seedSubscription("owner-user", "cesta");
  const owner = account("owner-user", "owner@getgolist.com");
  const guest = account("guest-user", "guest@getgolist.com");
  const ownerReference = doc(owner, "sharedLists", listId);

  await assertSucceeds(setDoc(ownerReference, sharedList()));

  await assertFails(
    updateDoc(doc(guest, "sharedLists", listId), {
      currentListName: "Outro nome",
      lists: {
        "Outro nome": sharedList().lists.Mercado,
      },
    }),
  );
  await assertFails(
    updateDoc(doc(guest, "sharedLists", listId), {
      "lists.Mercado.initialBalance": 500,
    }),
  );

  // Dono continua livre pra renomear e ajustar o orçamento.
  await assertSucceeds(
    updateDoc(doc(owner, "sharedLists", listId), {
      "lists.Mercado.initialBalance": 500,
    }),
  );
  await assertSucceeds(
    updateDoc(doc(owner, "sharedLists", listId), {
      currentListName: "Outro nome",
      lists: {
        "Outro nome": { ...sharedList().lists.Mercado, initialBalance: 500 },
      },
    }),
  );
});

test("participante registrado mantém acesso até o compartilhamento ser finalizado", async () => {
  await seedSubscription("owner-user", "cesta");
  const owner = account("owner-user", "owner@getgolist.com");
  const guest = account("guest-user", "guest@getgolist.com");
  const outsider = account("outsider-user", "outsider@getgolist.com");
  const ownerReference = doc(owner, "sharedLists", listId);

  await assertSucceeds(setDoc(ownerReference, sharedList({
    allowedEmails: ["owner@getgolist.com"],
    linkAccess: false,
    participantEmails: ["guest@getgolist.com"],
    participants: {
      "guest-user": {
        email: "guest@getgolist.com",
        name: "Convidado",
        lastAccessAt: "agora",
      },
    },
  })));

  await assertSucceeds(getDoc(doc(guest, "sharedLists", listId)));
  await assertFails(getDoc(doc(outsider, "sharedLists", listId)));
  await assertSucceeds(
    updateDoc(doc(guest, "sharedLists", listId), {
      "lists.Mercado.sectorOrder": ["Geral", "Bebidas"],
    }),
  );
});

test("setores personalizados são colaborativos, mas obedecem aos limites de segurança", async () => {
  await seedSubscription("owner-user", "cesta");
  const owner = account("owner-user", "owner@getgolist.com");
  const guest = account("guest-user", "guest@getgolist.com");
  const ownerReference = doc(owner, "sharedLists", listId);

  await assertSucceeds(setDoc(ownerReference, sharedList()));
  await assertSucceeds(
    updateDoc(doc(guest, "sharedLists", listId), {
      "lists.Mercado.sectorOrder": ["Geral", "Pet shop", "Bebidas geladas"],
    }),
  );
  await assertSucceeds(
    updateDoc(doc(guest, "sharedLists", listId), {
      "lists.Mercado.sectorOrder": ["Geral", "Bebidas geladas"],
    }),
  );
  await assertFails(
    updateDoc(doc(guest, "sharedLists", listId), {
      "lists.Mercado.sectorOrder": Array.from({ length: 51 }, (_, index) => `Setor ${index}`),
    }),
  );
  await assertFails(
    updateDoc(doc(guest, "sharedLists", listId), {
      campoInesperado: "conteúdo não autorizado",
    }),
  );
  await assertFails(
    updateDoc(doc(guest, "sharedLists", listId), {
      "lists.Mercado.items": Array.from({ length: 501 }, (_, index) => ({
        id: `item-${index}`,
        name: "Item",
        sector: "Geral",
        price: 1,
        quantity: 1,
        total: 1,
      })),
    }),
  );
});

test("encerrar o compartilhamento revoga imediatamente leitura e escrita", async () => {
  await seedSubscription("owner-user", "cesta");
  const owner = account("owner-user", "owner@getgolist.com");
  const guest = account("guest-user", "guest@getgolist.com");
  const outsider = account("outsider-user", "outsider@getgolist.com");
  const ownerReference = doc(owner, "sharedLists", listId);

  await assertSucceeds(setDoc(ownerReference, sharedList()));
  await assertSucceeds(
    updateDoc(ownerReference, {
      sharingEnded: true,
      endedAt: "agora",
      endedBy: "owner-user",
    }),
  );

  await assertSucceeds(getDoc(ownerReference));
  await assertFails(getDoc(doc(guest, "sharedLists", listId)));
  await assertFails(getDoc(doc(outsider, "sharedLists", listId)));
  await assertFails(
    updateDoc(doc(guest, "sharedLists", listId), {
      currentListName: "Ataque bloqueado",
    }),
  );

  const snapshot = await getDoc(ownerReference);
  assert.equal(snapshot.data().currentListName, "Mercado");
});

test("plano free só pode manter 1 lista, mas continua editando listas antigas acima do limite", async () => {
  const uid = "free-user";
  await seedSubscription(uid, "free");
  const user = account(uid, "free@getgolist.com");
  const reference = doc(user, `users/${uid}/appData/lists`);

  await assertSucceeds(
    setDoc(reference, { lists: listsOfSize(1), currentListName: "Lista 0" }),
  );
  await assertFails(
    setDoc(reference, { lists: listsOfSize(2), currentListName: "Lista 0" }),
  );

  // Conta antiga com mais listas do que o plano atual permite (grandfathered):
  // continua podendo editar/gravar desde que não aumente a contagem.
  await seedLists(uid, listsOfSize(3), "Lista 0");
  await assertSucceeds(
    setDoc(reference, { lists: listsOfSize(3), currentListName: "Lista 1" }),
  );
  await assertFails(
    setDoc(reference, { lists: listsOfSize(4), currentListName: "Lista 0" }),
  );
});

test("plano cesta permite até 10 listas e cestão não tem limite prático", async () => {
  const cestaUid = "cesta-user";
  await seedSubscription(cestaUid, "cesta");
  const cestaUser = account(cestaUid, "cesta@getgolist.com");
  const cestaReference = doc(cestaUser, `users/${cestaUid}/appData/lists`);

  await assertSucceeds(
    setDoc(cestaReference, { lists: listsOfSize(10), currentListName: "Lista 0" }),
  );
  await assertFails(
    setDoc(cestaReference, { lists: listsOfSize(11), currentListName: "Lista 0" }),
  );

  const cestaoUid = "cestao-user";
  await seedSubscription(cestaoUid, "cestao");
  const cestaoUser = account(cestaoUid, "cestao@getgolist.com");
  const cestaoReference = doc(cestaoUser, `users/${cestaoUid}/appData/lists`);

  await assertSucceeds(
    setDoc(cestaoReference, { lists: listsOfSize(25), currentListName: "Lista 0" }),
  );
});

test("compartilhar lista nova exige plano cesta ou cestão", async () => {
  const freeUid = "free-sharer";
  await seedSubscription(freeUid, "free");
  const freeUser = account(freeUid, "free-sharer@getgolist.com");

  await assertFails(
    setDoc(
      doc(freeUser, "sharedLists", listId),
      sharedList({ owner: freeUid, ownerEmail: "free-sharer@getgolist.com" }),
    ),
  );

  const cestaUid = "cesta-sharer";
  await seedSubscription(cestaUid, "cesta");
  const cestaUser = account(cestaUid, "cesta-sharer@getgolist.com");

  await assertSucceeds(
    setDoc(
      doc(cestaUser, "sharedLists", listId),
      sharedList({ owner: cestaUid, ownerEmail: "cesta-sharer@getgolist.com" }),
    ),
  );
});

test("cliente nunca grava diretamente em billing/subscription", async () => {
  const uid = "billing-user";
  await seedSubscription(uid, "free");
  const user = account(uid, "billing-user@getgolist.com");

  await assertFails(
    setDoc(doc(user, `users/${uid}/billing/subscription`), {
      plan: "cestao",
      status: "active",
    }),
  );
  await assertSucceeds(getDoc(doc(user, `users/${uid}/billing/subscription`)));
});

test("contas cortesia (COMPLIMENTARY_CESTAO_EMAILS) têm acesso de Cestão mesmo sem documento de assinatura", async () => {
  const uid = "complimentary-user";
  const user = account(uid, "tubel.mendes@gmail.com");
  const reference = doc(user, `users/${uid}/appData/lists`);

  // Sem seedSubscription nenhum — nem documento de billing/subscription
  // existe, e ainda assim o limite aplicado deve ser o do Cestão (sem
  // limite prático), não o do Free.
  await assertSucceeds(
    setDoc(reference, { lists: listsOfSize(25), currentListName: "Lista 0" }),
  );

  const freeUid = "not-complimentary-user";
  const freeUser = account(freeUid, "alguem-qualquer@getgolist.com");
  await assertFails(
    setDoc(doc(freeUser, `users/${freeUid}/appData/lists`), {
      lists: listsOfSize(2),
      currentListName: "Lista 0",
    }),
  );
});

test("conta cortesia pode criar compartilhamento novo mesmo sem assinatura paga registrada", async () => {
  const uid = "complimentary-sharer";
  const user = account(uid, "gabrielamoraesn@gmail.com");

  await assertSucceeds(
    setDoc(
      doc(user, "sharedLists", listId),
      sharedList({ owner: uid, ownerEmail: "gabrielamoraesn@gmail.com" }),
    ),
  );
});
