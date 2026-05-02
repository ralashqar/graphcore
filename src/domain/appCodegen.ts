import { z } from 'zod'

export const appCodegenStackSchema = z.enum(['expo_react_native'])
export const appPreviewTargetSchema = z.enum(['expo_web', 'expo_go', 'custom_dev_build'])
export const appCodeFileStatusSchema = z.enum(['planned', 'generated', 'validated', 'failed'])

export const appCodeFilePlanSchema = z.object({
  path: z.string().min(1),
  ownerTower: z.string().min(1),
  exports: z.array(z.string()).default([]),
  imports: z.array(z.string()).default([]),
  status: appCodeFileStatusSchema.default('planned'),
  validationErrors: z.array(z.string()).default([]),
})

export const appCodegenProjectPlanSchema = z.object({
  stack: appCodegenStackSchema.default('expo_react_native'),
  previewTarget: appPreviewTargetSchema.default('expo_web'),
  files: z.array(appCodeFilePlanSchema).default([]),
  commands: z.array(z.string()).default(['npm install', 'npm run typecheck', 'npm run lint', 'npx expo start --web']),
  nativeCapabilityWarnings: z.array(z.string()).default([]),
})

export type AppCodeFilePlan = z.infer<typeof appCodeFilePlanSchema>
export type AppCodegenProjectPlan = z.infer<typeof appCodegenProjectPlanSchema>

export const APP_EXPO_BASE_FILE_PLAN: AppCodeFilePlan[] = [
  { path: 'package.json', ownerTower: 'project_setup', exports: [], imports: [], status: 'planned', validationErrors: [] },
  { path: 'app.json', ownerTower: 'project_setup', exports: [], imports: [], status: 'planned', validationErrors: [] },
  { path: 'eas.json', ownerTower: 'project_setup', exports: [], imports: [], status: 'planned', validationErrors: [] },
  { path: '.env.example', ownerTower: 'project_setup', exports: [], imports: [], status: 'planned', validationErrors: [] },
  { path: 'README.md', ownerTower: 'project_setup', exports: [], imports: [], status: 'planned', validationErrors: [] },
  { path: 'app/_layout.tsx', ownerTower: 'navigation', exports: ['RootLayout'], imports: [], status: 'planned', validationErrors: [] },
  { path: 'app/index.tsx', ownerTower: 'navigation', exports: ['IndexScreen'], imports: [], status: 'planned', validationErrors: [] },
  { path: 'lib/backend/AppBackend.ts', ownerTower: 'backend', exports: ['AppBackend'], imports: [], status: 'planned', validationErrors: [] },
  { path: 'lib/backend/LocalMockBackendAdapter.ts', ownerTower: 'backend', exports: ['LocalMockBackendAdapter'], imports: ['AppBackend'], status: 'planned', validationErrors: [] },
  { path: 'lib/backend/ManagedBackendAdapter.ts', ownerTower: 'backend', exports: ['ManagedBackendAdapter'], imports: ['AppBackend'], status: 'planned', validationErrors: [] },
  { path: 'types/appGraph.ts', ownerTower: 'shared_contracts', exports: ['AppEntity', 'AppActionResult'], imports: [], status: 'planned', validationErrors: [] },
]

export function createDefaultAppCodegenProjectPlan(extraFiles: AppCodeFilePlan[] = []): AppCodegenProjectPlan {
  return appCodegenProjectPlanSchema.parse({
    stack: 'expo_react_native',
    previewTarget: 'expo_web',
    files: [...APP_EXPO_BASE_FILE_PLAN, ...extraFiles],
  })
}
