import { Capacitor } from "@capacitor/core";
import {
  getToken,
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";
import { firebaseApp } from "@/lib/firebase";

const RECAPTCHA_SITE_KEY =
  process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ??
  "6Lf_8nEtAAAAACSA6bpk3s2s9raecd6-iGqIiyxI";

let webAppCheck: AppCheck | null = null;
let nativeInitialization: Promise<void> | null = null;

function browserAppCheck() {
  if (!webAppCheck) {
    webAppCheck = initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }
  return webAppCheck;
}

async function nativeAppCheckToken() {
  const { FirebaseAppCheck } = await import("@capacitor-firebase/app-check");
  if (!nativeInitialization) {
    nativeInitialization = FirebaseAppCheck.initialize({
      isTokenAutoRefreshEnabled: true,
    });
  }
  await nativeInitialization;
  return (await FirebaseAppCheck.getToken({ forceRefresh: false })).token;
}

export async function getAppCheckToken() {
  if (Capacitor.isNativePlatform()) {
    try {
      return await nativeAppCheckToken();
    } catch {
      // Enquanto o APK ainda não foi distribuído pela Play Store, o WebView
      // usa o reCAPTCHA vinculado ao domínio como proteção alternativa.
    }
  }

  return (await getToken(browserAppCheck(), false)).token;
}
