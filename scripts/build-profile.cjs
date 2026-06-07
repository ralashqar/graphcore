const { spawnSync } = require('node:child_process')

const profile = process.argv[2]

if (profile !== 'landing' && profile !== 'full') {
  console.error('Usage: node scripts/build-profile.cjs <landing|full>')
  process.exit(1)
}

const commandEnv = { ...process.env, VITE_APP_PROFILE: profile }

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: commandEnv,
    shell: true,
    stdio: 'inherit',
    ...options,
  })

  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (profile === 'landing') {
  run('node', ['scripts/audit-landing-assets.cjs'])
}

run('npx', ['tsc'])
run('npx', ['vite', 'build'])

if (profile === 'landing') {
  run('node', ['scripts/prune-landing-dist.cjs'])
  run('node', ['scripts/write-landing-seo-assets.cjs'])
}
