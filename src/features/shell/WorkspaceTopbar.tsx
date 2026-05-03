import type { GameSummary, WorkspaceTab, WorldWorkspaceMode } from '../../shared/workspace'
import { EntityIcon, type EntityIconId } from '../../shared/entityIcons'

type TopbarNavItem =
  | { kind: 'world'; mode: WorldWorkspaceMode; label: string; icon: EntityIconId }
  | { kind: 'workspace'; tab: Exclude<WorkspaceTab, 'graph'>; label: string; icon: EntityIconId }

const TOPBAR_NAV_ITEMS: TopbarNavItem[] = [
  { kind: 'world', mode: 'graph', label: 'Graph', icon: 'graph' },
  { kind: 'world', mode: 'wiki', label: 'Wiki', icon: 'content' },
  { kind: 'world', mode: 'timeline', label: 'Timeline', icon: 'event' },
  { kind: 'world', mode: 'board', label: 'Board', icon: 'thread' },
  { kind: 'world', mode: 'code', label: 'Code', icon: 'code' },
  { kind: 'workspace', tab: 'library', label: 'Library', icon: 'content' },
  { kind: 'workspace', tab: 'outputs', label: 'Outputs', icon: 'cinematic' },
  { kind: 'workspace', tab: 'global', label: 'Global', icon: 'global' },
]

type WorkspaceTopbarProps = {
  activeTab: WorkspaceTab
  activeGameId?: string | null
  canResetProjectWorld?: boolean
  creditBalance?: number | null
  currentUserEmail?: string | null
  games: GameSummary[]
  onOpenActivity: () => void
  onOpenAuth: () => void
  onOpenBilling?: () => void
  onOpenNewGame: () => void
  onResetProjectWorld?: () => void
  onSelectGame: (projectId: string) => void
  onSetActiveTab: (tab: WorkspaceTab) => void
  onSetWorldViewMode: (mode: WorldWorkspaceMode) => void
  onSignOut: () => void
  projectType?: string | null
  projectName: string
  sourceLabel: string
  tabs?: Array<{ id: WorkspaceTab; label: string; icon: EntityIconId }>
  worldViewMode: WorldWorkspaceMode
  workspaceName: string
  draftName: string
  hideNavigation?: boolean
  isSignedIn: boolean
}

export function WorkspaceTopbar({
  activeTab,
  activeGameId,
  canResetProjectWorld,
  creditBalance,
  currentUserEmail,
  draftName,
  games,
  hideNavigation = false,
  isSignedIn,
  onOpenActivity,
  onOpenAuth,
  onOpenBilling,
  onOpenNewGame,
  onResetProjectWorld,
  onSelectGame,
  onSetActiveTab,
  onSetWorldViewMode,
  onSignOut,
  projectType,
  projectName,
  sourceLabel,
  worldViewMode,
  workspaceName,
}: WorkspaceTopbarProps) {
  const userInitial = (currentUserEmail ?? 'G').trim().charAt(0).toUpperCase() || 'G'
  const displayCredits = creditBalance ?? 0
  const navItems = TOPBAR_NAV_ITEMS.filter((item) => (
    item.kind !== 'world' || item.mode !== 'code' || projectType === 'app'
  ))
  return (
    <header className="topbar">
      <div className="brand-cluster">
        <div className="brand-mark">G</div>
        {games.length > 0 ? (
          <label className="topbar-project-select">
            <span className="sr-only">Project</span>
            <select value={activeGameId ?? ''} onChange={(event) => onSelectGame(event.target.value)}>
              {games.map((game) => (
                <option key={game.projectId} value={game.projectId}>
                  {game.projectName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="brand-line">GraphCore</div>
        )}
        <span className="topbar-draft-label">{draftName}</span>
      </div>
      {hideNavigation ? <div className="topbar-center" aria-hidden="true" /> : (
        <div className="topbar-center">
          <nav className="tabbar" aria-label="Workspace tabs">
            {navItems.map((item) => {
              const active = item.kind === 'world'
                ? activeTab === 'graph' && worldViewMode === item.mode
                : activeTab === item.tab
              return (
              <button
                key={item.kind === 'world' ? `world:${item.mode}` : item.tab}
                className={active ? 'tab-button is-active' : 'tab-button'}
                onClick={() => {
                  if (item.kind === 'world') {
                    onSetWorldViewMode(item.mode)
                    return
                  }
                  onSetActiveTab(item.tab)
                }}
                type="button"
              >
                <EntityIcon className="tab-button-icon" id={item.icon} />
                {item.label}
              </button>
              )
            })}
          </nav>
        </div>
      )}
      <div className="topbar-actions">
        <button
          className="topbar-credit-pill"
          aria-label={`AI credits ${displayCredits}`}
          onClick={onOpenBilling}
          type="button"
          title="Open billing"
        >
          <EntityIcon id="credits" />
          <strong>{displayCredits.toLocaleString()}</strong>
        </button>
        <button className="topbar-user-avatar" onClick={isSignedIn ? undefined : onOpenAuth} type="button" aria-label={currentUserEmail ?? 'Sign in'}>
          {userInitial}
        </button>
        <details className="topbar-utility-menu">
          <summary className="topbar-menu-trigger" aria-label="Workspace menu">
            <EntityIcon id="menu" />
          </summary>
          <div className="topbar-utility-panel">
            <div className="topbar-utility-meta">
              <span className="section-label">Workspace</span>
              <strong>{workspaceName}</strong>
              <span>{projectName} / {draftName}</span>
              <span>{sourceLabel}</span>
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
