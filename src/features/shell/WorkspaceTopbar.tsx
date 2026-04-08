import type { GameSummary, WorkspaceTab } from '../../shared/workspace'

type WorkspaceTopbarProps = {
  activeTab: WorkspaceTab
  activeGameId?: string | null
  currentUserEmail?: string | null
  isCompiling: boolean
  games: GameSummary[]
  onCompile: () => void
  onOpenActivity: () => void
  onOpenAuth: () => void
  onOpenNewGame: () => void
  onSelectGame: (projectId: string) => void
  onSetActiveTab: (tab: WorkspaceTab) => void
  onSignOut: () => void
  projectName: string
  sourceLabel: string
  tabs: Array<{ id: WorkspaceTab; label: string }>
  workspaceName: string
  draftName: string
  isSignedIn: boolean
}

export function WorkspaceTopbar({
  activeTab,
  activeGameId,
  currentUserEmail,
  draftName,
  games,
  isCompiling,
  isSignedIn,
  onCompile,
  onOpenActivity,
  onOpenAuth,
  onOpenNewGame,
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
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="topbar-actions">
        {games.length > 0 ? (
          <label className="topbar-select-wrap">
            <span className="topbar-select-label">Game</span>
            <select className="topbar-select" value={activeGameId ?? ''} onChange={(event) => onSelectGame(event.target.value)}>
              {games.map((game) => (
                <option key={game.projectId} value={game.projectId}>
                  {game.projectName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="signal-pill"><span>{sourceLabel}</span></div>
        <div className="signal-pill"><span>{currentUserEmail ?? 'Not signed in'}</span></div>
        <button className="ghost-button" onClick={onOpenNewGame} type="button">New Game</button>
        <button className="ghost-button" onClick={onOpenActivity} type="button">Activity</button>
        {isSignedIn
          ? <button className="ghost-button" onClick={onSignOut} type="button">Sign out</button>
          : <button className="ghost-button" onClick={onOpenAuth} type="button">Sign in</button>}
        <button className="primary-button" onClick={onCompile} type="button">{isCompiling ? 'Compiling...' : 'Publish bundle'}</button>
      </div>
    </header>
  )
}
