import type { AuthMode } from '../../shared/workspace'

type AuthDialogProps = {
  authEmail: string
  authError: string | null
  authInfo: string | null
  authMode: AuthMode
  authPendingConfirmation: boolean
  authPassword: string
  onClose: () => void
  onEmailChange: (value: string) => void
  onGoogleAuth: () => void
  onModeChange: (mode: AuthMode) => void
  onPasswordChange: (value: string) => void
  onResendConfirmation: () => void
  onSubmit: () => void
}

export function AuthDialog({
  authEmail,
  authError,
  authInfo,
  authMode,
  authPendingConfirmation,
  authPassword,
  onClose,
  onEmailChange,
  onGoogleAuth,
  onModeChange,
  onPasswordChange,
  onResendConfirmation,
  onSubmit,
}: AuthDialogProps) {
  return (
    <div className="auth-overlay" onClick={onClose} role="presentation">
      <section className="auth-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="surface-head">
          <div>
            <span className="eyebrow">Supabase Auth</span>
            <h2>{authMode === 'sign_in' ? 'Sign in to GraphCore' : authMode === 'sign_up' ? 'Create your account' : 'Send a magic link'}</h2>
            <p className="subtle-line">
              {authMode === 'magic_link'
                ? 'Use email-only login when you want the fastest path into the live workspace.'
                : authMode === 'sign_up'
                  ? 'Create an account for live prompt generation, patch apply, and bundle publishing. Password sign-in may still require email confirmation depending on your Supabase settings.'
                  : 'Sign in to use hosted prompt generation, live patch apply, and bundle publishing.'}
            </p>
          </div>
          <button className="ghost-button compact" onClick={onClose} type="button">Close</button>
        </div>
        <div className="segmented-control auth-mode-switch">
          <button className={authMode === 'sign_in' ? 'segment-button is-active' : 'segment-button'} onClick={() => onModeChange('sign_in')} type="button">Sign in</button>
          <button className={authMode === 'sign_up' ? 'segment-button is-active' : 'segment-button'} onClick={() => onModeChange('sign_up')} type="button">Sign up</button>
          <button className={authMode === 'magic_link' ? 'segment-button is-active' : 'segment-button'} onClick={() => onModeChange('magic_link')} type="button">Magic link</button>
        </div>
        <div className="auth-form">
          <button className="oauth-button google-oauth-button" onClick={onGoogleAuth} type="button">
            <span className="google-oauth-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img">
                <path d="M21.6 12.23c0-.68-.06-1.34-.17-1.97H12v3.73h5.39a4.62 4.62 0 0 1-2 3.04v2.52h3.24c1.9-1.75 2.97-4.32 2.97-7.32Z" fill="#4285F4" />
                <path d="M12 22c2.7 0 4.96-.89 6.61-2.41l-3.24-2.52c-.9.6-2.05.96-3.37.96-2.59 0-4.78-1.75-5.56-4.1H3.09v2.59A9.97 9.97 0 0 0 12 22Z" fill="#34A853" />
                <path d="M6.44 13.93A5.99 5.99 0 0 1 6.13 12c0-.67.11-1.31.31-1.93V7.48H3.09A9.99 9.99 0 0 0 2 12c0 1.61.39 3.13 1.09 4.52l3.35-2.59Z" fill="#FBBC05" />
                <path d="M12 5.97c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.97 14.69 2 12 2A9.97 9.97 0 0 0 3.09 7.48l3.35 2.59c.78-2.35 2.97-4.1 5.56-4.1Z" fill="#EA4335" />
              </svg>
            </span>
            <span>Continue with Google</span>
          </button>
          <div className="auth-divider">
            <span>or continue with email</span>
          </div>
          <label className="field-block">
            <span>Email</span>
            <input autoComplete="email" onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" type="email" value={authEmail} />
          </label>
          {authMode !== 'magic_link' ? (
            <label className="field-block">
              <span>Password</span>
              <input autoComplete={authMode === 'sign_in' ? 'current-password' : 'new-password'} minLength={6} onChange={(event) => onPasswordChange(event.target.value)} placeholder="At least 6 characters" type="password" value={authPassword} />
            </label>
          ) : null}
          {authMode === 'sign_up' ? (
            <div className="inline-note">
              For quick testing, disable email confirmation in Supabase Auth or make sure your email provider is configured. Default email flows can hit rate limits quickly.
            </div>
          ) : null}
          {authInfo ? <div className="inline-note">{authInfo}</div> : null}
          {authError ? <div className="inline-note is-error">{authError}</div> : null}
          <div className="auth-actions">
            {authPendingConfirmation && authEmail.trim() ? (
              <button className="ghost-button" onClick={onResendConfirmation} type="button">
                Resend confirmation
              </button>
            ) : null}
            <button className="primary-button" onClick={onSubmit} type="button">
              {authMode === 'sign_in' ? 'Sign in' : authMode === 'sign_up' ? 'Create account' : 'Send link'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
