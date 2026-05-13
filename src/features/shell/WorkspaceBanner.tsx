type WorkspaceBannerProps = {
  isPending: boolean
  message: string
  onCreateLiveWorkspace: () => void
}

export function WorkspaceBanner({ isPending, message, onCreateLiveWorkspace }: WorkspaceBannerProps) {
  return (
    <section className="workspace-banner">
      <div className="workspace-banner-copy">
        <span className="eyebrow">Live Project Setup</span>
        <h2>SynArc is still showing the bundled demo snapshot.</h2>
        <p>{message}</p>
      </div>
      <div className="workspace-banner-actions">
        <button className="primary-button" onClick={onCreateLiveWorkspace} type="button">
          {isPending ? 'Creating live workspace...' : 'Create live workspace'}
        </button>
      </div>
    </section>
  )
}
