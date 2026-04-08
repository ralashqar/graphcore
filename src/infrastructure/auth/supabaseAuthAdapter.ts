import {
  getCurrentSession,
  resendSignupConfirmation,
  sendMagicLink,
  signInWithGoogle,
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
  signInWithPassword,
  signOut,
  signUpWithPassword,
  subscribeToAuthChanges,
}
