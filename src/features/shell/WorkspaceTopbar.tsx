import type { GameSummary, WorkspaceTab } from '../../shared/workspace'
import { EntityIcon, type EntityIconId } from '../../shared/entityIcons'

type WorkspaceTopbarProps = {
  activeTab: WorkspaceTab
  activeGameId?: string | null
  canResetProjectWorld?: boolean
  currentUserEmail?: string | null
  games: GameSummary[]
  onOpenActivity: () => void
  onOpenAuth: () => void
  onOpenNewGame: () => void
  onResetProjectWorld?: () => void
  onSelectGame: (projectId: string) => void
  onSetActiveTab: (tab: WorkspaceTab) => void
  onSignOut: () => void
  projectName: string
  sourceLabel: string
  tabs: Array<{ id: WorkspaceTab; label: string; icon: EntityIconId }>
  workspaceName: string
  draftName: string
  isSignedIn: boolean
}

export function WorkspaceTopbar({
  activeTab,
  activeGameId,
  canResetProjectWorld,
  currentUserEmail,
  draftName,
  games,
  isSignedIn,
  onOpenActivity,
  onOpenAuth,
  onOpenNewGame,
  onResetProjectWorld,
  onSelectGame,
  onSetActiveTab,
  onSignOut,
  projectName,
  sourceLabel,
  tabs,
  workspaceName,
}: WorkspaceTopbarProps) {
  return (
    <header className="topbar">
      <div className="brand-cluster">
        <div className="brand-mark">G</div>
        <div>
          <div className="brand-line">GraphCore</div>
          <p className="subtle-line">{workspaceName} / {projectName} / {draftName}</p>
        </div>
      </div>
      <div className="topbar-center">
        <nav className="tabbar" aria-label="Workspace tabs">
          {tabs.map((tab) => (
            <button key={tab.id} className={tab.id === activeTab ? 'tab-button is-active' : 'tab-button'} onClick={() => onSetActiveTab(tab.id)} type="button">
              <EntityIcon className="tab-button-icon" id={tab.icon} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="topbar-actions">
        {games.length > 0 ? (
          <div className="topbar-context-cluster">
            <label className="topbar-select-wrap">
              <span className="topbar-select-label">Project</span>
              <select className="topbar-select" value={activeGameId ?? ''} onChange={(event) => onSelectGame(event.target.value)}>
                {games.map((game) => (
                  <option key={game.projectId} value={game.projectId}>
                    {game.projectName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        <details className="topbar-utility-menu">
          <summary className="ghost-button topbar-utility-trigger">Workspace</summary>
          <div className="topbar-utility-panel">
            <div className="topbar-utility-meta">
              <span className="section-label">Workspace</span>
              <strong>{sourceLabel}</strong>
              <span>{currentUserEmail ?? 'Not signed in'}</span>
            </div>
            <button className="ghost-button compact" onClick={onOpenNewGame} type="button">New Project</button>
            <button className="ghost-button compact" onClick={onOpenActivity} type="button">History</button>
            {canResetProjectWorld && onResetProjectWorld ? (
              <button className="ghost-button compact danger" onClick={onResetProjectWorld} type="button">Reset Project World</button>
            ) : null}
            {isSignedIn
              ? <button className="ghost-button compact" onClick={onSignOut} type="button">Sign out</button>
              : <button className="ghost-button compact" onClick={onOpenAuth} type="button">Sign in</button>}
          </div>
        </details>
      </div>
    </header>
  )
}
