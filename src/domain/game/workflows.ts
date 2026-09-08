import { z } from 'zod'
import { gameDesignSchema, buildManifestSchema, assetRecipeSchema, artifactSchema } from './contracts.ts'
import { createWorkflowNodeManifest } from '../outputWorkflowManifests.ts'

export const GAME_WORKFLOW_NODES = [
  createWorkflowNodeManifest({ purpose: 'game_design_plan', label: 'Game design', requiredInputs: ['prompt', 'context'], producedOutputs: ['design'], artifactRoles: ['game_design'], previewRoles: ['text'], recoveryStrategy: 'node_step', progressLabel: 'Planning game systems', providerBacked: true, manualOnly: false, inputSchema: z.object({ prompt: z.string(), context: z.record(z.string(), z.unknown()) }).strict(), outputSchema: z.object({ design: gameDesignSchema }).strict() }),
  createWorkflowNodeManifest({ purpose: 'game_contract_validation', label: 'System contracts', requiredInputs: ['design'], producedOutputs: ['design'], artifactRoles: [], previewRoles: [], recoveryStrategy: 'node_step', progressLabel: 'Validating contracts', providerBacked: false, manualOnly: false, inputSchema: z.object({ design: gameDesignSchema }).strict(), outputSchema: z.object({ design: gameDesignSchema }).strict() }),
  createWorkflowNodeManifest({ purpose: 'game_compile', label: 'Compile adventure', requiredInputs: ['design'], producedOutputs: ['manifest'], artifactRoles: ['game_build'], previewRoles: [], recoveryStrategy: 'node_step_artifact', progressLabel: 'Compiling playable build', providerBacked: false, manualOnly: false, inputSchema: z.object({ design: gameDesignSchema }).strict(), outputSchema: z.object({ manifest: buildManifestSchema }).strict() }),
  createWorkflowNodeManifest({ purpose: 'game_asset_production', label: 'Produce game asset', requiredInputs: ['recipe'], producedOutputs: ['artifact'], artifactRoles: ['game_mesh'], previewRoles: [], recoveryStrategy: 'node_step_artifact', progressLabel: 'Preparing production mesh', providerBacked: true, manualOnly: true, inputSchema: z.object({ recipe: assetRecipeSchema }).strict(), outputSchema: z.object({ artifact: artifactSchema }).strict() }),
]
export const gameWorkflowStages = {
  generate: [{ key: 'scope', label: 'Intent & scope' }, { key: 'brief', label: 'Game brief & dialogue' }, { key: 'style', label: 'Art direction' }, { key: 'movement', label: 'Movement subsystem' }, { key: 'inventory', label: 'Inventory subsystem' }, { key: 'scene', label: 'Level, prefabs & recipes' }, { key: 'contracts', label: 'Contracts & traversal' }, { key: 'register', label: 'Save design revision' }],
  build: [{ key: 'compile', label: 'Compile manifests' }, { key: 'rules', label: 'Gameplay acceptance' }, { key: 'browser', label: 'Browser & asset validation' }, { key: 'register', label: 'Register playable build' }],
  asset: [{ key: 'reference', label: 'Subject reference' }, { key: 'mesh', label: 'Image to mesh' }, { key: 'prepare', label: 'Blender preparation' }, { key: 'validate', label: 'GLB validation' }, { key: 'register', label: 'Accept asset revision' }],
} as const
