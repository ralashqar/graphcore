import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="shell">
    <section class="hero">
      <p class="eyebrow">Vite + TypeScript</p>
      <h1>GraphCore</h1>
      <p class="lede">
        A clean Vite starter is in place. Edit <code>src/main.ts</code> and
        <code>src/style.css</code> to start building.
      </p>
      <div class="actions">
        <a href="https://vite.dev/guide/" target="_blank" rel="noreferrer">Vite docs</a>
        <a href="https://www.typescriptlang.org/docs/" target="_blank" rel="noreferrer">
          TypeScript docs
        </a>
      </div>
    </section>

    <section class="grid" aria-label="Project shortcuts">
      <article class="card">
        <span class="label">Dev</span>
        <h2>Run the app</h2>
        <p>Start the dev server with <code>npm run dev</code>.</p>
      </article>
      <article class="card">
        <span class="label">Build</span>
        <h2>Check production output</h2>
        <p>Create a production build with <code>npm run build</code>.</p>
      </article>
      <article class="card">
        <span class="label">Edit</span>
        <h2>Start from a minimal base</h2>
        <p>The stock demo assets and counter boilerplate have been removed.</p>
      </article>
    </section>
  </main>
`
