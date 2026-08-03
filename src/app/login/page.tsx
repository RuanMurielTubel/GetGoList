"use client";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signOut,
  signInWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { firebaseAuth } from "@/lib/firebase";
import { getAppCheckToken } from "@/lib/app-check";

type Mode = "login" | "register" | "verify";

function strongPasswordMessage(password: string) {
  if (password.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (!/[a-z]/.test(password)) return "Inclua pelo menos uma letra minúscula.";
  if (!/[A-Z]/.test(password)) return "Inclua pelo menos uma letra maiúscula.";
  if (!/\d/.test(password)) return "Inclua pelo menos um número.";
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Inclua pelo menos um caractere especial, como !, @, # ou $.";
  }
  return "";
}

function messageForError(code?: string) {
  const messages: Record<string, string> = {
    "auth/email-already-in-use": "Este e-mail já possui uma conta.",
    "auth/invalid-credential": "E-mail ou senha inválidos.",
    "auth/invalid-email": "Digite um e-mail válido.",
    "auth/too-many-requests":
      "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    "auth/weak-password": "Escolha uma senha mais forte.",
    "auth/network-request-failed":
      "Não foi possível conectar. Verifique sua internet.",
    "auth/operation-not-allowed":
      "O cadastro por e-mail ainda precisa ser ativado no Firebase.",
    "auth/popup-closed-by-user":
      "A janela de login foi fechada antes de concluir. Tente novamente.",
    "auth/cancelled-popup-request":
      "O login foi cancelado. Tente novamente.",
    "auth/popup-blocked":
      "O popup de login foi bloqueado. Permita popups para continuar.",
    "auth/unauthorized-domain":
      "Domínio não autorizado no Firebase. Verifique as configurações do console.",
    "auth/operation-not-supported-in-this-environment":
      "Este navegador não suporta login com popup. Use outro navegador.",
    "auth/redirect-cancelled-by-user":
      "O redirecionamento de login foi cancelado. Tente novamente.",
    "auth/native-google-token-missing":
      "O Google não devolveu a autorização ao aplicativo. Tente novamente.",
  };

  return (
    messages[code ?? ""] ??
    "Não foi possível concluir. Tente novamente em alguns instantes."
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [isNativeApp, setIsNativeApp] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setRedirectTo(searchParams.get('redirect') || '/index.html');
    setIsNativeApp(
      Capacitor.isNativePlatform() || searchParams.get("app") === "android",
    );
  }, []);

  useEffect(() => {
    if (!redirectTo) {
      return;
    }
    return onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        if (!user.emailVerified) {
          setEmail(user.email || "");
          setMode("verify");
          setLoading(false);
          return;
        }
        router.replace(redirectTo);
      }
    });
  }, [router, redirectTo]);

  async function handleGoogleSignIn() {
    setFeedback("");
    setLoading(true);
    const provider = new GoogleAuthProvider();

    try {
      if (Capacitor.isNativePlatform()) {
        const { FirebaseAuthentication } = await import(
          "@capacitor-firebase/authentication"
        );
        const result = await FirebaseAuthentication.signInWithGoogle({
          skipNativeAuth: true,
        });
        const idToken = result.credential?.idToken;

        if (!idToken) {
          throw { code: "auth/native-google-token-missing" };
        }

        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(firebaseAuth, credential);
        return;
      }

      await signInWithPopup(firebaseAuth, provider);
      // onAuthStateChanged cuidará do redirecionamento
    } catch (error) {
      const errObj = error as { code?: string; message?: string };
      const code = errObj.code;
      const isPopupBlocked = code === "auth/popup-blocked";

      if (isPopupBlocked) {
        try {
          await signInWithRedirect(firebaseAuth, provider);
          return;
        } catch (redirectError) {
          const redirectErrObj = redirectError as { code?: string };
          setFeedback(
            messageForError(redirectErrObj.code) ||
              "O navegador bloqueou a janela de login. Tente abrir novamente em breve."
          );
          return;
        }
      }

      setFeedback(messageForError(code));
    } finally {
      setLoading(false);
    }
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setFeedback("");
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");

    if (mode === "register" && name.trim().length < 2) {
      setFeedback("Digite seu nome.");
      return;
    }

    const passwordProblem = mode === "register" ? strongPasswordMessage(password) : "";
    if (passwordProblem) {
      setFeedback(passwordProblem);
      return;
    }

    if (mode === "register" && password !== confirmPassword) {
      setFeedback("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "register") {
        await getAppCheckToken();
        const credential = await createUserWithEmailAndPassword(
          firebaseAuth,
          email.trim(),
          password,
        );
        await updateProfile(credential.user, { displayName: name.trim() });
        setMode("verify");
        await requestVerificationCode(credential.user, false);
        setFeedback("Enviamos um código de 6 dígitos para o seu e-mail.");
        setLoading(false);
      } else {
        const credential = await signInWithEmailAndPassword(
          firebaseAuth,
          email.trim(),
          password,
        );
        if (!credential.user.emailVerified) {
          setMode("verify");
          setFeedback("Confirme seu e-mail. Se precisar, solicite um novo código.");
          setLoading(false);
        }
      }
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : undefined;
      const controlledMessage =
        error instanceof Error && !code && error.message.startsWith("Não foi possível")
          ? error.message
          : "";
      setFeedback(controlledMessage || messageForError(code));
      setLoading(false);
    }
  }

  async function requestVerificationCode(
    user = firebaseAuth.currentUser,
    showSuccess = true,
  ) {
    if (!user) throw new Error("UNAUTHENTICATED");
    const [token, appCheckToken] = await Promise.all([
      user.getIdToken(),
      getAppCheckToken(),
    ]);
    const response = await fetch("/api/auth/email-code/request", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Firebase-AppCheck": appCheckToken,
      },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (result.code === "RESEND_TOO_SOON") {
        throw new Error("Aguarde um minuto antes de pedir outro código.");
      }
      if (result.code === "SEND_LIMIT_REACHED") {
        throw new Error("Limite de envios atingido. Tente novamente em uma hora.");
      }
      throw new Error("Não foi possível enviar o código agora. Tente novamente.");
    }
    if (showSuccess) setFeedback("Um novo código foi enviado para o seu e-mail.");
  }

  async function handleResendCode() {
    setFeedback("");
    setLoading(true);
    try {
      await requestVerificationCode();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível reenviar o código.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    if (!/^\d{6}$/.test(verificationCode)) {
      setFeedback("Digite os 6 números recebidos por e-mail.");
      return;
    }

    setLoading(true);
    try {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error("Sua sessão expirou. Entre novamente.");
      const [token, appCheckToken] = await Promise.all([
        user.getIdToken(),
        getAppCheckToken(),
      ]);
      const response = await fetch("/api/auth/email-code/verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Firebase-AppCheck": appCheckToken,
        },
        body: JSON.stringify({ code: verificationCode }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const messages: Record<string, string> = {
          INVALID_CODE: "Código incorreto. Confira e tente novamente.",
          CODE_EXPIRED: "Esse código expirou. Solicite um novo.",
          TOO_MANY_ATTEMPTS: "Muitas tentativas. Solicite um novo código.",
        };
        throw new Error(messages[result.code] || "Não foi possível confirmar o código.");
      }
      await user.reload();
      await user.getIdToken(true);
      router.replace(redirectTo || "/index.html");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível confirmar o código.");
      setLoading(false);
    }
  }

  async function handleLeaveVerification() {
    await signOut(firebaseAuth);
    setMode("login");
    setVerificationCode("");
    setFeedback("");
  }

  async function handlePasswordReset() {
    setFeedback("");

    if (!email.trim()) {
      setFeedback("Digite seu e-mail para receber a recuperação de senha.");
      return;
    }

    setLoading(true);
    try {
      const appCheckToken = await getAppCheckToken();
      const response = await fetch("/api/email/password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Firebase-AppCheck": appCheckToken,
        },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (response.status === 503) {
        await sendPasswordResetEmail(firebaseAuth, email.trim());
      } else if (!response.ok) {
        throw new Error("PASSWORD_RESET_EMAIL_FAILED");
      }
      setFeedback(
        "Se houver uma conta com esse e-mail, enviaremos as instruções de recuperação.",
      );
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : undefined;
      setFeedback(messageForError(code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={`account-page${isNativeApp ? " account-page-app" : ""}`}>
      <section className="account-intro">
        <Link className="brand account-brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          <span>GetGoList</span>
        </Link>

        <div>
          <p className="eyebrow">Suas listas com você</p>
          <h1>Salve suas compras e continue em qualquer dispositivo.</h1>
          <p>
            Crie sua conta para manter suas listas sincronizadas com segurança.
          </p>
        </div>

        <ul className="account-benefits">
          <li>
            <span>✓</span> Backup das listas
          </li>
          <li>
            <span>✓</span> Acesso em outros aparelhos
          </li>
          <li>
            <span>✓</span> Compartilhamento de listas
          </li>
        </ul>
      </section>

      <section className="account-card" aria-labelledby="account-title">
        {isNativeApp && (
          <div className="account-app-brand" aria-label="GetGoList">
            <span className="brand-mark" aria-hidden="true">
              G
            </span>
            <span>GetGoList</span>
          </div>
        )}

        {mode === "verify" ? (
          <div>
            <div className="account-card-heading">
              <p className="eyebrow">Proteção da sua conta</p>
              <h2 id="account-title">Confirme seu e-mail</h2>
              <p>
                Enviamos um código de 6 dígitos para <strong>{email}</strong>.
                Sua conta só será liberada depois da confirmação.
              </p>
            </div>
            <form className="account-form" onSubmit={handleVerifyCode}>
              <label>
                Código de confirmação
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) =>
                    setVerificationCode(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="000000"
                  required
                  style={{ fontSize: 24, letterSpacing: 8, textAlign: "center" }}
                  value={verificationCode}
                />
              </label>
              {feedback && (
                <p className="account-feedback" role="status">{feedback}</p>
              )}
              <button className="button button-primary" disabled={loading}>
                {loading ? "Confirmando..." : "Confirmar e liberar minha conta"}
              </button>
            </form>
            <button className="password-reset" disabled={loading} onClick={handleResendCode} type="button">
              Reenviar código
            </button>
            <button className="password-reset" disabled={loading} onClick={handleLeaveVerification} type="button">
              Voltar para o login
            </button>
          </div>
        ) : (
          <>
        <div className="account-tabs" role="tablist" aria-label="Acesso">
          <button
            aria-selected={mode === "login"}
            className={mode === "login" ? "active" : ""}
            onClick={() => changeMode("login")}
            role="tab"
            type="button"
          >
            Entrar
          </button>
          <button
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            onClick={() => changeMode("register")}
            role="tab"
            type="button"
          >
            Criar conta
          </button>
        </div>

        <div className="account-card-heading">
          <h2 id="account-title">
            {mode === "login" ? "Bem-vindo de volta" : "Crie sua conta"}
          </h2>
          <p>
            {mode === "login"
              ? "Entre para acessar suas listas salvas."
              : "Leva menos de um minuto."}
          </p>
        </div>

        <form className="account-form" onSubmit={handleSubmit}>
          {mode === "register" && (
            <label>
              Nome
              <input
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Como podemos chamar você?"
                required
                type="text"
                value={name}
              />
            </label>
          )}

          <label>
            E-mail
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@email.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label>
            Senha
            <input
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={mode === "register" ? 8 : 6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === "register" ? "Crie uma senha forte" : "Sua senha"}
              required
              type="password"
              value={password}
            />
          </label>

          {mode === "register" && (
            <p style={{ color: "#5f7185", fontSize: 12, lineHeight: 1.5, margin: "-4px 0 2px" }}>
              Use 8 ou mais caracteres, com maiúscula, minúscula, número e símbolo.
            </p>
          )}

          {mode === "register" && (
            <label>
              Confirme a senha
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Digite a senha novamente"
                required
                type="password"
                value={confirmPassword}
              />
            </label>
          )}

          {feedback && (
            <p className="account-feedback" role="status">
              {feedback}
            </p>
          )}

          <button className="button button-primary" disabled={loading}>
            {loading
              ? "Aguarde..."
              : mode === "login"
                ? "Entrar na minha conta"
                : "Criar conta e salvar listas"}
          </button>
        </form>

        {mode === "login" && (
          <button
            className="password-reset"
            disabled={loading}
            onClick={handlePasswordReset}
            type="button"
          >
            Esqueci minha senha
          </button>
        )}

        <div className="guest-divider">
          <span>ou</span>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
          <button
            className="button button-google"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            {loading ? (
              'Aguarde...'
            ) : (
              <>
                <span className="google-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 3.48c1.69 0 2.86.73 3.52 1.34l2.58-2.5C13.93.91 11.7 0 9 0 5.48 0 2.48 1.92 1 4.74l2.93 2.28C4.7 4.26 6.62 3.48 9 3.48z" fill="#EA4335"/>
                    <path d="M17.64 9.2c0-.64-.06-1.26-.18-1.86H9v3.52h4.84c-.21 1.14-.84 2.1-1.8 2.75l2.93 2.28C16.43 14.06 17.64 11.85 17.64 9.2z" fill="#34A853"/>
                    <path d="M3.94 10.02A5.41 5.41 0 0 1 3.6 9c0-.35.06-.7.14-1.02L.81 5.7A8.99 8.99 0 0 0 0 9c0 1.4.34 2.72.95 3.88l2.99-2.86z" fill="#FBBC05"/>
                    <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.93-2.28c-.81.55-1.85.87-3.03.87-2.38 0-4.4-1.28-5.57-3.17L.95 14.88C2.47 16.99 5.48 18 9 18z" fill="#4285F4"/>
                  </svg>
                </span>
                Entrar com Google
              </>
            )}
          </button>
        </div>

        <p className="account-terms">
          Ao usar o GetGoList, você declara ciência da nossa{" "}
          <Link href="/privacidade">Política de Privacidade e Segurança</Link>.
        </p>
          </>
        )}
      </section>
    </main>
  );
}
