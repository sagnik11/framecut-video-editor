import { ArrowLeftIcon, EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "../lib/auth-client";
import { navigate } from "../lib/navigation";
import { AutterMark } from "./AutterMark";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";

export function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const signingUp = mode === "sign-up";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const result = signingUp
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });

      if (result.error) {
        setError(result.error.message || "Authentication failed. Please try again.");
        return;
      }
      navigate("/projects");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <header className="auth-header">
        <button className="text-button" type="button" onClick={() => navigate("/")}><ArrowLeftIcon /> Home</button>
        <ThemeToggle />
      </header>
      <div className="auth-layout">
        <aside className="auth-context">
          <p className="eyebrow"><span>Framecut account</span> Private workspace</p>
          <h1>Your next cut starts here.</h1>
          <p>A quick account, then straight to the fun part. Render on your device and save only what you want.</p>
          <AutterMark label="Made possible by" />
        </aside>
        <section className="auth-panel">
          <Brand compact />
          <div className="auth-copy">
            <h2>{signingUp ? "Let’s make something" : "Welcome back"}</h2>
            <p>{signingUp ? "Three quick fields, then your first Framecut project is ready." : "Sign in and jump back into your projects."}</p>
          </div>
          <form onSubmit={submit} noValidate aria-describedby="auth-error">
          {signingUp && (
            <label>
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" minLength={2} maxLength={80} required aria-invalid={Boolean(error)} />
            </label>
          )}
          <label>
            <span>Email address</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required aria-invalid={Boolean(error)} />
          </label>
          <label>
            <span>Password</span>
            <span className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={signingUp ? "new-password" : "current-password"}
                minLength={8}
                maxLength={128}
                required
                aria-invalid={Boolean(error)}
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </span>
            {signingUp && <small>Use at least 8 characters.</small>}
          </label>
          <p className={`form-error ${error ? "" : "is-empty"}`} id="auth-error" aria-live="polite">{error || "No errors"}</p>
          <button className="button primary auth-submit" type="submit" disabled={pending} data-state={pending ? "loading" : undefined} aria-busy={pending}>
            {pending ? "Please wait..." : signingUp ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="auth-switch">
          {signingUp ? "Already have an account?" : "New to Framecut?"}{" "}
          <button type="button" onClick={() => navigate(signingUp ? "/sign-in" : "/sign-up")}>
            {signingUp ? "Sign in" : "Create account"}
          </button>
        </p>
        </section>
      </div>
    </main>
  );
}
