import { supabaseAuthAdapter } from '../../infrastructure/auth/supabaseAuthAdapter'

export const authService = {
  getCurrentSession: supabaseAuthAdapter.getCurrentSession,
  resendSignupConfirmation: supabaseAuthAdapter.resendSignupConfirmation,
  sendMagicLink: supabaseAuthAdapter.sendMagicLink,
  signInWithGoogle: supabaseAuthAdapter.signInWithGoogle,
  signInWithOAuthProvider: supabaseAuthAdapter.signInWithOAuthProvider,
  signInWithPassword: supabaseAuthAdapter.signInWithPassword,
  signOut: supabaseAuthAdapter.signOut,
  signUpWithPassword: supabaseAuthAdapter.signUpWithPassword,
  subscribeToAuthChanges: supabaseAuthAdapter.subscribeToAuthChanges,
}
