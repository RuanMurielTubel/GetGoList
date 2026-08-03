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

  await assertSucceeds(setDoc(reference, { lists: {} }));
  await assertSucceeds(getDoc(reference));
  await assertFails(getDoc(doc(other, "users/owner-user/appData/lists")));
  await assertFails(getDoc(doc(unverified, "users/owner-user/appData/lists")));
});

test("somente o proprietário pode criar uma lista em seu próprio nome", async () => {
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

test("participante registrado mantém acesso até o compartilhamento ser finalizado", async () => {
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
  const owner = account("owner-user", "owner@getgolist.com");
  const guest = account("guest-user", "guest@getgolist.com");
  const outsider = account("outsider-user", "outsider@getgolist.com");
  const ownerReference = doc(owner, "sharedLists", listId);

  await assertSucceeds(setDoc(ownerReference, sharedList()));
  await assertSucceeds(
    updateDoc(ownerReference, { sharingEnded: true, endedAt: "agora" }),
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
