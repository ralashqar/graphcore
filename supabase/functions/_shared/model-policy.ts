// Central model policy: maps task classes to a text model + reasoning effort.
//
// Goals:
// - One place to change models instead of ~50 hardcoded literals.
// - Task-complexity-aware reasoning effort ("thinking mode") for the
//   OpenAI Responses API, which was previously unused except one call site.
// - Every class is overridable via env without code changes:
//     OUTPUT_WORKFLOW_MODEL_<CLASS>      e.g. OUTPUT_WORKFLOW_MODEL_DIRECTOR_PLAN=gpt-5.4
//     OUTPUT_WORKFLOW_REASONING_<CLASS>  e.g. OUTPUT_WORKFLOW_REASONING_DIRECTOR_PLAN=high
//   (CLASS is the task class upper-cased.)
//
// Defaults preserve current behavior for model choice (OUTPUT_WORKFLOW_TEXT_MODEL
// or gpt-5.4) so rolling this out cannot regress quality; reasoning effort is
// where complexity-based differentiation kicks in.

export type OutputTextTaskClass =
  | 'director_plan' // cinematic sequence plan / shot direction (hardest planning task)
  | 'continuity_structure' // sequence animatic global continuity graph derivation
  | 'scene_shot_plan' // per-scene shot continuity stream (mechanical conversion of one scene; global structure already decided)
  | 'screenplay_author' // screenplay / script authoring
  | 'block_script' // per-block timed script
  | 'chapter_prose' // long-form prose
  | 'utility_prompt' // atlas prompts, image prompt phrasing, extraction labels
  | 'repair' // structural repair passes
  | 'default_text'

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'

export type OutputTextModelPolicy = {
  model: string
  reasoningEffort: ReasoningEffort | null
}

const DEFAULT_TEXT_MODEL = 'gpt-5.4'
const DEFAULT_LIGHT_TEXT_MODEL = 'gpt-5.4-mini'

const defaultReasoningByClass: Record<OutputTextTaskClass, ReasoningEffort | null> = {
  director_plan: 'high',
  continuity_structure: 'high',
  // Reasoning tokens count against max_output_tokens; at 'high' a single scene burned
  // 11-15k reasoning tokens and truncated 32k budgets in production (2026-06-10).
  scene_shot_plan: 'medium',
  screenplay_author: 'medium',
  block_script: 'medium',
  chapter_prose: 'medium',
  utility_prompt: 'low',
  repair: 'low',
  default_text: null,
}

/** Classes that may default to the light model when no env override exists. */
const lightModelClasses = new Set<OutputTextTaskClass>(['utility_prompt', 'repair'])

function baseTextModel() {
  return Deno.env.get('OUTPUT_WORKFLOW_TEXT_MODEL')?.trim() || DEFAULT_TEXT_MODEL
}

function lightTextModel() {
  return Deno.env.get('OUTPUT_WORKFLOW_LIGHT_TEXT_MODEL')?.trim() || DEFAULT_LIGHT_TEXT_MODEL
}

function readEnvForClass(prefix: string, taskClass: OutputTextTaskClass) {
  return Deno.env.get(`${prefix}_${taskClass.toUpperCase()}`)?.trim() || ''
}

function normalizeReasoningEffort(value: string): ReasoningEffort | null {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'minimal' || normalized === 'low' || normalized === 'medium' || normalized === 'high') return normalized
  if (normalized === 'none' || normalized === 'off') return null
  return null
}

export function resolveOutputTextModelPolicy(taskClass: OutputTextTaskClass): OutputTextModelPolicy {
  const modelOverride = readEnvForClass('OUTPUT_WORKFLOW_MODEL', taskClass)
  const reasoningOverride = readEnvForClass('OUTPUT_WORKFLOW_REASONING', taskClass)
  const model = modelOverride
    || (lightModelClasses.has(taskClass) && Deno.env.get('OUTPUT_WORKFLOW_USE_LIGHT_MODELS') === 'true'
      ? lightTextModel()
      : baseTextModel())
  const reasoningEffort = reasoningOverride
    ? normalizeReasoningEffort(reasoningOverride)
    : defaultReasoningByClass[taskClass]
  return { model, reasoningEffort }
}

/** Convenience: builds the `reasoning` payload for the OpenAI Responses API, or undefined. */
export function reasoningPayloadFor(policy: OutputTextModelPolicy): Record<string, unknown> | undefined {
  return policy.reasoningEffort ? { effort: policy.reasoningEffort } : undefined
}
