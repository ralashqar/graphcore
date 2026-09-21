import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import { signInWithOAuthProvider } from "../../data/auth";
import { supabase } from "../../utils/supabase";
export function CityDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      className="city-dialog"
      ref={ref}
      onCancel={onClose}
      aria-label={title}
    >
      <div className="city-dialog-heading">
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function CityAuth({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <CityDialog
      title={signup ? "Make yourself at home." : "Welcome back."}
      onClose={onClose}
    >
      <p>
        One Synarc account for exploring the city and building your business.
      </p>
      <button
        type="button"
        className="city-google-sign-in"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            await signInWithOAuthProvider("google", window.location.pathname + window.location.search);
          } catch (error) {
            setMessage((error as Error).message);
            setBusy(false);
          }
        }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M21.6 12.23c0-.68-.06-1.34-.17-1.97H12v3.73h5.39a4.62 4.62 0 0 1-2 3.04v2.52h3.24c1.9-1.75 2.97-4.32 2.97-7.32Z" fill="#4285F4" />
          <path d="M12 22c2.7 0 4.96-.89 6.61-2.41l-3.24-2.52c-.9.6-2.05.96-3.37.96-2.59 0-4.78-1.75-5.56-4.1H3.09v2.59A9.97 9.97 0 0 0 12 22Z" fill="#34A853" />
          <path d="M6.44 13.93A5.99 5.99 0 0 1 6.13 12c0-.67.11-1.31.31-1.93V7.48H3.09A9.99 9.99 0 0 0 2 12c0 1.61.39 3.13 1.09 4.52l3.35-2.59Z" fill="#FBBC05" />
          <path d="M12 5.97c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.97 14.69 2 12 2A9.97 9.97 0 0 0 3.09 7.48l3.35 2.59c.78-2.35 2.97-4.1 5.56-4.1Z" fill="#EA4335" />
        </svg>
        Continue with Google
      </button>
      <p className="city-auth-divider">or use your email</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const redirect = new URL(
              window.location.pathname,
              window.location.origin,
            ).toString();
            const response = signup
              ? await supabase.auth.signUp({
                  email,
                  password,
                  options: { emailRedirectTo: redirect },
                })
              : await supabase.auth.signInWithPassword({ email, password });
            if (response.error) throw response.error;
            if (response.data.session) {
              onSuccess();
              onClose();
            } else
              setMessage(
                "Check your email to confirm your account, then return here to sign in.",
              );
          } catch (error) {
            setMessage((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email
          <input
            autoComplete="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            autoComplete={signup ? "new-password" : "current-password"}
            type="password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {message && (
          <p role="status" className="city-message">
            {message}
          </p>
        )}
        <button className="city-primary" disabled={busy}>
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </button>
        <button
          type="button"
          className="city-text-button"
          disabled={busy}
          onClick={() => {
            setSignup(!signup);
            setMessage("");
          }}
        >
          {signup
            ? "Already have an account? Sign in"
            : "New to Synarc? Create an account"}
        </button>
        <button
          type="button"
          className="city-text-button"
          disabled={busy || !email}
          onClick={async () => {
            setBusy(true);
            try {
              const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                  emailRedirectTo: new URL(
                    window.location.pathname,
                    window.location.origin,
                  ).toString(),
                },
              });
              if (error) throw error;
              setMessage("Check your email for a sign-in link.");
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Email me a sign-in link
        </button>
      </form>
    </CityDialog>
  );
}
