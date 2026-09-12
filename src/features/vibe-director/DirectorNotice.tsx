import type { ReactNode } from 'react'
import { X } from '@phosphor-icons/react'

export function DirectorNotice({ tone = 'info', role = 'status', children, onDismiss, action }: {
  tone?: 'info' | 'warning' | 'error'
  role?: 'status' | 'alert'
  children: ReactNode
  onDismiss?: () => void
  action?: ReactNode
}) {
  return (
    <div className={`director-notice is-${tone}`} role={role}>
      <span className="director-notice-text">{children}</span>
      {action ? <span className="director-notice-actions">{action}</span> : null}
      {onDismiss ? <button type="button" className="ghost-button compact director-notice-dismiss" aria-label="Dismiss message" onClick={onDismiss}><X size={14} /></button> : null}
    </div>
  )
}
