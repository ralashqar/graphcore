import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";
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
