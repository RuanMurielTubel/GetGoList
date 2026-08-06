import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getAppCheck } from "firebase-admin/app-check";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function adminApp() {
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ?.trim()
    .replace(/^"|"$/g, "")
    .replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export function adminAuth() {
  return getAuth(adminApp());
}

export function adminFirestore() {
  return getFirestore(adminApp());
}

export function adminAppCheck() {
  return getAppCheck(adminApp());
}

export function adminStorage() {
  return getStorage(adminApp());
}
