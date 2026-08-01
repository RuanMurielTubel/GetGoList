"use client";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { firebaseAuth } from "@/lib/firebase";

type Mode = "login" | "register";

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
  };

  return (
    messages[code ?? ""] ??
    "Não foi possível concluir. Tente novamente em alguns instantes."
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        window.location.replace("/index.html");
      }
    });
  }, []);

  async function handleGoogleSignIn() {
    setFeedback("");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(firebaseAuth, provider);
      // onAuthStateChanged cuidará do redirecionamento
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : undefined;
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

    if (password.length < 6) {
      setFeedback("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (mode === "register" && password !== confirmPassword) {
      setFeedback("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(
          firebaseAuth,
          email.trim(),
          password,
        );
        await updateProfile(credential.user, { displayName: name.trim() });
      } else {
        await signInWithEmailAndPassword(
          firebaseAuth,
          email.trim(),
          password,
        );
      }
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : undefined;
      setFeedback(messageForError(code));
      setLoading(false);
    }
  }

  async function handlePasswordReset() {
    setFeedback("");

    if (!email.trim()) {
      setFeedback("Digite seu e-mail para receber a recuperação de senha.");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim());
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
    <main className="account-page">
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
            Ao criar uma conta, suas listas locais serão preservadas e
            preparadas para sincronização segura.
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
            <span>✓</span> Base para compartilhamento familiar
          </li>
        </ul>
      </section>

      <section className="account-card" aria-labelledby="account-title">
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
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo de 6 caracteres"
              required
              type="password"
              value={password}
            />
          </label>

          {mode === "register" && (
            <label>
              Confirme a senha
              <input
                autoComplete="new-password"
                minLength={6}
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
                  G
                </span>
                Entrar com Google
              </>
            )}
          </button>
        </div>

        <p className="account-terms">
          Ao criar uma conta, você concorda em usar o GetGoList de forma
          responsável. A política de privacidade será publicada antes do
          lançamento público.
        </p>
      </section>
    </main>
  );
}
