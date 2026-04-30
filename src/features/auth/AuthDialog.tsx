import type { Provider } from '@supabase/supabase-js'
import type { ReactNode } from 'react'

import type { AuthMode } from '../../shared/workspace'

type SocialAuthProvider = Extract<Provider, 'apple' | 'discord' | 'github' | 'google'>

const socialAuthProviders: Array<{
  label: string
  provider: SocialAuthProvider
  renderIcon: () => ReactNode
}> = [
  {
    label: 'Google',
    provider: 'google',
    renderIcon: () => (
      <svg viewBox="0 0 24 24" role="img">
        <path d="M21.6 12.23c0-.68-.06-1.34-.17-1.97H12v3.73h5.39a4.62 4.62 0 0 1-2 3.04v2.52h3.24c1.9-1.75 2.97-4.32 2.97-7.32Z" fill="#4285F4" />
        <path d="M12 22c2.7 0 4.96-.89 6.61-2.41l-3.24-2.52c-.9.6-2.05.96-3.37.96-2.59 0-4.78-1.75-5.56-4.1H3.09v2.59A9.97 9.97 0 0 0 12 22Z" fill="#34A853" />
        <path d="M6.44 13.93A5.99 5.99 0 0 1 6.13 12c0-.67.11-1.31.31-1.93V7.48H3.09A9.99 9.99 0 0 0 2 12c0 1.61.39 3.13 1.09 4.52l3.35-2.59Z" fill="#FBBC05" />
        <path d="M12 5.97c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.97 14.69 2 12 2A9.97 9.97 0 0 0 3.09 7.48l3.35 2.59c.78-2.35 2.97-4.1 5.56-4.1Z" fill="#EA4335" />
      </svg>
    ),
  },
  {
    label: 'GitHub',
    provider: 'github',
    renderIcon: () => (
      <svg viewBox="0 0 24 24" role="img">
        <path d="M12 2.25c-5.39 0-9.75 4.36-9.75 9.75 0 4.31 2.79 7.96 6.67 9.25.49.09.67-.21.67-.47v-1.82c-2.71.59-3.28-1.15-3.28-1.15-.44-1.13-1.08-1.43-1.08-1.43-.89-.61.07-.59.07-.59.98.07 1.5 1.01 1.5 1.01.87 1.49 2.28 1.06 2.84.81.09-.63.34-1.06.62-1.3-2.16-.25-4.44-1.08-4.44-4.82 0-1.06.38-1.94 1.01-2.62-.1-.25-.44-1.24.1-2.58 0 0 .83-.26 2.69 1a9.32 9.32 0 0 1 4.9 0c1.86-1.26 2.68-1 2.68-1 .54 1.34.2 2.33.1 2.58.63.68 1.01 1.56 1.01 2.62 0 3.75-2.28 4.57-4.45 4.81.35.3.66.9.66 1.81v2.68c0 .26.18.56.67.47A9.76 9.76 0 0 0 21.75 12c0-5.39-4.36-9.75-9.75-9.75Z" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: 'Discord',
    provider: 'discord',
    renderIcon: () => (
      <svg viewBox="0 0 24 24" role="img">
        <path d="M19.54 5.25A18.76 18.76 0 0 0 14.88 3.8c-.2.36-.43.84-.59 1.23a17.4 17.4 0 0 0-5.18 0c-.16-.39-.4-.87-.6-1.23a18.72 18.72 0 0 0-4.66 1.46C.9 9.62.1 13.88.5 18.08a18.9 18.9 0 0 0 5.72 2.9c.46-.63.87-1.29 1.22-2a12.27 12.27 0 0 1-1.93-.93c.16-.12.32-.24.47-.37a13.42 13.42 0 0 0 11.44 0l.47.37c-.61.36-1.25.67-1.94.93.35.71.76 1.37 1.22 2a18.85 18.85 0 0 0 5.73-2.9c.46-4.87-.78-9.09-3.36-12.83ZM8.18 15.5c-1.12 0-2.04-1.03-2.04-2.29s.9-2.3 2.04-2.3c1.14 0 2.06 1.04 2.04 2.3 0 1.26-.9 2.29-2.04 2.29Zm7.04 0c-1.12 0-2.04-1.03-2.04-2.29s.9-2.3 2.04-2.3c1.14 0 2.06 1.04 2.04 2.3 0 1.26-.9 2.29-2.04 2.29Z" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: 'Apple',
    provider: 'apple',
    renderIcon: () => (
      <svg viewBox="0 0 24 24" role="img">
        <path d="M16.46 12.74c-.02-2.42 1.98-3.58 2.07-3.64-1.13-1.65-2.88-1.88-3.5-1.9-1.49-.15-2.9.88-3.65.88-.76 0-1.93-.86-3.17-.83-1.63.02-3.14.95-3.98 2.41-1.7 2.95-.43 7.32 1.22 9.71.81 1.17 1.78 2.49 3.05 2.44 1.22-.05 1.69-.79 3.17-.79s1.9.79 3.2.76c1.32-.02 2.16-1.19 2.96-2.37.93-1.36 1.31-2.67 1.33-2.74-.03-.01-2.58-.99-2.6-3.93ZM14.05 5.63c.67-.81 1.12-1.94 1-3.06-.96.04-2.12.64-2.81 1.45-.62.72-1.16 1.87-1.01 2.97 1.06.08 2.15-.54 2.82-1.36Z" fill="currentColor" />
      </svg>
    ),
  },
]

type AuthDialogProps = {
  authEmail: string
  authError: string | null
  authInfo: string | null
  authMode: AuthMode
  authPendingConfirmation: boolean
  authPassword: string
  onClose: () => void
  onEmailChange: (value: string) => void
  onModeChange: (mode: AuthMode) => void
  onOAuthAuth: (provider: SocialAuthProvider, label: string) => void
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
  onModeChange,
  onOAuthAuth,
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
          <div className="oauth-provider-grid">
            {socialAuthProviders.map((provider) => (
              <button className={`oauth-button oauth-button-${provider.provider}`} key={provider.provider} onClick={() => onOAuthAuth(provider.provider, provider.label)} type="button">
                <span className="oauth-icon" aria-hidden="true">
                  {provider.renderIcon()}
                </span>
                <span>Continue with {provider.label}</span>
              </button>
            ))}
          </div>
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
