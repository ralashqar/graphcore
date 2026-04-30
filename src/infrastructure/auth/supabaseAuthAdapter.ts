import {
  getCurrentSession,
  resendSignupConfirmation,
  sendMagicLink,
  signInWithGoogle,
  signInWithOAuthProvider,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  subscribeToAuthChanges,
} from '../../data/auth'

export const supabaseAuthAdapter = {
  getCurrentSession,
  resendSignupConfirmation,
  sendMagicLink,
  signInWithGoogle,
  signInWithOAuthProvider,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  subscribeToAuthChanges,
}
