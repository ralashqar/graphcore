import { useEffect, useState } from 'react'
import { supabase } from './utils/supabase'

type Todo = {
  id: number
  name: string
  is_complete: boolean
  created_at: string
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function getTodos() {
      setLoading(true)

      const { data, error: queryError } = await supabase
        .from('todos')
        .select('id, name, is_complete, created_at')
        .order('id', { ascending: true })

      if (!active) {
        return
      }

      if (queryError) {
        setError(queryError.message)
        setTodos([])
      } else {
        setError(null)
        setTodos(data ?? [])
      }

      setLoading(false)
    }

    void getTodos()

    return () => {
      active = false
    }
  }, [])

  return (
    <main className="app-shell">
      <div className="stack">
        <section className="panel hero-panel">
          <span className="eyebrow">Supabase + Vite + React</span>
          <h1>GraphCore</h1>
          <p className="lede">
            The app now has a hosted Supabase client for browser queries and a
            local <code>supabase/</code> workspace for migrations and edge
            functions.
          </p>

          <div className="command-row">
            <article className="command-card">
              <span>Frontend</span>
              <strong>
                <code>npm run dev</code>
              </strong>
              <p>Runs the Vite app with the Supabase client configured from env.</p>
            </article>
            <article className="command-card">
              <span>Backend</span>
              <strong>
                <code>npm run supabase:start</code>
              </strong>
              <p>Starts the local Supabase stack for migrations, functions, and auth.</p>
            </article>
            <article className="command-card">
              <span>Schema</span>
              <strong>
                <code>npm run supabase:db:reset</code>
              </strong>
              <p>Replays migrations and seed data against the local database.</p>
            </article>
          </div>
        </section>

        <section className="meta-grid">
          <article className="meta-card">
            <span>Env</span>
            <strong>Hosted project connected</strong>
            <p>
              <code>.env</code> is set to your hosted Supabase project URL and
              publishable key.
            </p>
          </article>
          <article className="meta-card">
            <span>SQL</span>
            <strong>Todos schema included</strong>
            <p>
              An initial migration creates a public <code>todos</code> table and
              a read policy for the anon key.
            </p>
          </article>
          <article className="meta-card">
            <span>Functions</span>
            <strong>Healthcheck endpoint ready</strong>
            <p>
              A starter edge function lives at <code>supabase/functions/healthcheck</code>.
            </p>
          </article>
        </section>

        <section className="content-grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Todos Query</h2>
                <p>Loaded from Supabase using the browser client in <code>src/utils/supabase.ts</code>.</p>
              </div>
              <span className="status-pill">
                {loading ? 'Loading' : `${todos.length} rows`}
              </span>
            </div>

            {error ? (
              <p className="error-state">
                Query failed: {error}. If this is a new hosted project, create
                the <code>todos</code> table or point the app at your local
                stack after running the Supabase migrations.
              </p>
            ) : null}

            {!error && !loading && todos.length === 0 ? (
              <p className="empty-state">
                The connection is working, but no rows were returned. Add rows to
                <code>public.todos</code> or run the local seed data.
              </p>
            ) : null}

            {!error && todos.length > 0 ? (
              <ul className="todo-list">
                {todos.map((todo) => (
                  <li key={todo.id}>
                    <div>
                      <strong>{todo.name}</strong>
                      <span>{todo.is_complete ? 'Complete' : 'Pending'}</span>
                    </div>
                    <span>{new Date(todo.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <aside className="panel">
            <h2>Backend Authoring Flow</h2>
            <p className="panel-copy">
              Use the local Supabase workspace for schema and function changes,
              then link the project when you are ready to push those changes to
              the hosted instance.
            </p>

            <ol className="steps">
              <li>Write SQL migrations in <code>supabase/migrations</code>.</li>
              <li>Develop edge functions in <code>supabase/functions</code>.</li>
              <li>Run <code>npm run supabase:start</code> and <code>npm run supabase:db:reset</code>.</li>
              <li>Use <code>npm run supabase:link</code> and <code>npm run supabase:db:push</code> when you want to update the hosted project.</li>
            </ol>
          </aside>
        </section>
      </div>
    </main>
  )
}
