import { useEffect, useRef, useState } from "react";
import {
  clearToken,
  fetchAuthConfig,
  fetchCurrentUser,
  getToken,
  setToken,
  signInWithGoogleCredential,
} from "./api";

const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

function loadGoogleScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  const existing = document.querySelector(`script[src="${GSI_SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Google Sign-In"))
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Sign-In"));
    document.head.appendChild(script);
  });
}

export default function AuthBar({ user, onUserChange, onStatus }) {
  const [googleClientId, setGoogleClientId] = useState("");
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const buttonRef = useRef(null);
  const onStatusRef = useRef(onStatus);
  const onUserChangeRef = useRef(onUserChange);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    onUserChangeRef.current = onUserChange;
  }, [onUserChange]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const config = await fetchAuthConfig();
        if (cancelled) return;
        setGoogleClientId(config.googleClientId || "");

        const token = getToken();
        if (token) {
          try {
            const currentUser = await fetchCurrentUser();
            if (!cancelled) onUserChangeRef.current?.(currentUser);
          } catch {
            clearToken();
            if (!cancelled) onUserChangeRef.current?.(null);
          }
        } else if (!cancelled) {
          onUserChangeRef.current?.(null);
        }
      } catch (err) {
        if (!cancelled) {
          setAuthError(err.message);
          onUserChangeRef.current?.(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || user || !googleClientId || !buttonRef.current) return undefined;

    let cancelled = false;

    async function renderButton() {
      try {
        await loadGoogleScript();
        if (cancelled || !buttonRef.current || !window.google?.accounts?.id) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response) => {
            try {
              const result = await signInWithGoogleCredential(
                response.credential
              );
              setToken(result.token);
              onUserChangeRef.current?.(result.user);
              setAuthError("");
              onStatusRef.current?.(`Signed in as ${result.user.name}`);
            } catch (err) {
              setAuthError(err.message);
              onStatusRef.current?.(err.message, true);
            }
          },
        });

        buttonRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
        });
      } catch (err) {
        if (!cancelled) {
          setAuthError(err.message);
        }
      }
    }

    renderButton();
    return () => {
      cancelled = true;
    };
  }, [ready, user, googleClientId]);

  function handleSignOut() {
    clearToken();
    onUserChangeRef.current?.(null);
    onStatusRef.current?.("Signed out");
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  }

  if (!ready) {
    return <div className="auth-bar auth-bar-loading">Checking sign-in…</div>;
  }

  if (user) {
    return (
      <div className="auth-bar">
        {user.picture ? (
          <img
            className="auth-avatar"
            src={user.picture}
            alt=""
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="auth-avatar auth-avatar-fallback" aria-hidden="true">
            {(user.name || user.email || "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="auth-user">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
        <button type="button" className="auth-sign-out" onClick={handleSignOut}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="auth-bar">
      {googleClientId ? (
        <div ref={buttonRef} className="auth-google-button" />
      ) : (
        <p className="auth-setup-hint">
          Set <code>VITE_GOOGLE_CLIENT_ID</code> and{" "}
          <code>GOOGLE_CLIENT_ID</code> to enable Google sign-in.
        </p>
      )}
      {authError ? <p className="auth-error">{authError}</p> : null}
    </div>
  );
}
