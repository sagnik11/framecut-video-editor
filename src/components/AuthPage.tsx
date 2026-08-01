import { ArrowLeftIcon, EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "../lib/auth-client";
import { navigate } from "../lib/navigation";
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
      <section className="auth-panel">
        <Brand />
        <div className="auth-copy">
          <h1>{signingUp ? "Create your workspace" : "Welcome back"}</h1>
          <p>{signingUp ? "Save source files, edits, and exports to your Cloudflare-backed account." : "Sign in to continue editing your projects."}</p>
        </div>
        <form onSubmit={submit} noValidate>
          {signingUp && (
            <label>
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" minLength={2} maxLength={80} required />
            </label>
          )}
          <label>
            <span>Email address</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
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
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </span>
            {signingUp && <small>Use at least 8 characters.</small>}
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary auth-submit" type="submit" disabled={pending}>
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
    </main>
  );
}
