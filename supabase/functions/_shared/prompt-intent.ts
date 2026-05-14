import {
  classifyPromptIntentScored,
  normalizePromptIntentClassification,
  promptIntentCatalogForLlm,
  promptIntentClassificationResultSchema,
  type PromptIntentClassificationResult,
} from '../../../src/domain/promptIntentClassifier.ts'
import type { promptIntentClassificationRequestSchema } from '../../../src/domain/outputWorkflow.ts'
import type { z } from 'zod'
import { runOpenAiResponses } from './openai.ts'

type PromptIntentClassificationRequest = z.infer<typeof promptIntentClassificationRequestSchema>

function classifierModel() {
  return Deno.env.get('PROMPT_INTENT_CLASSIFIER_MODEL')?.trim()
    || Deno.env.get('OUTPUT_REQUEST_PLANNER_MODEL')?.trim()
    || Deno.env.get('OUTPUT_WORKFLOW_TEXT_MODEL')?.trim()
    || 'gpt-5.4-mini'
}

function classifierMode() {
  const raw = Deno.env.get('PROMPT_INTENT_CLASSIFIER_MODE')?.trim().toLowerCase()
  if (raw === 'legacy' || raw === 'scored' || raw === 'llm') return raw
  return 'llm'
}

function compactWorldMetadata(snapshot: PromptIntentClassificationRequest['snapshot']) {
  return {
    project: snapshot.project,
    projectType: snapshot.projectContext?.projectType ?? snapshot.projectContext?.primaryIntent ?? null,
    worldWiki: {
      title: snapshot.worldWiki.title,
      logline: snapshot.worldWiki.logline,
      tags: snapshot.worldWiki.tags,
      synopsis: snapshot.worldWiki.synopsis,
    },
    entityCounts: snapshot.worldEntities.reduce<Record<string, number>>((counts, entity) => {
      counts[entity.nodeType] = (counts[entity.nodeType] ?? 0) + 1
      return counts
    }, {}),
    sequenceUnitNames: snapshot.worldEntities
      .filter((entity) => entity.nodeType === 'sequence_unit')
      .slice(0, 16)
      .map((entity) => ({ key: entity.key, name: entity.name, summary: entity.summary })),
  }
}

export async function classifyPromptIntentServer(
  request: PromptIntentClassificationRequest,
): Promise<PromptIntentClassificationResult> {
  const scored = classifyPromptIntentScored(request.prompt, {
    sourceSurface: request.sourceSurface,
    selectedSuggestionId: request.selectedSuggestionId ?? null,
    classifierMode: 'scored',
  })
  const mode = classifierMode()
  if (mode === 'legacy' || mode === 'scored') {
    return promptIntentClassificationResultSchema.parse({
      ...scored,
      classifierMode: mode === 'legacy' ? 'legacy_scored_compat' : 'scored',
    })
  }

  try {
    const response = await runOpenAiResponses({
      model: classifierModel(),
      instructions: [
        'You are GraphCore\'s prompt intent router.',
        'Choose exactly one best primary intent from the supplied intent catalog.',
        'Rank the prompt against the catalog as a whole. Do not run independent yes/no checks in order.',
        'Use deterministic evidence as hints, but correct it when the prompt semantics are clearer.',
        'Explicit artifact nouns beat style adjectives: "poster image with cinematic light" is poster_image, not cinematic_episode.',
        'World mutation means changing canonical graph data. Output generation means producing a separate artifact from existing canon.',
        'If the prompt is a normal question, choose answer_only. If genuinely unclear, choose ambiguous and require confirmation.',
        'A selected suggestion may bias toward world_mutation unless the user explicitly asks to create an output artifact.',
        'Return JSON only.',
      ].join('\n'),
      input: JSON.stringify({
        prompt: request.prompt,
        sourceSurface: request.sourceSurface,
        selectedSuggestionId: request.selectedSuggestionId ?? null,
        world: compactWorldMetadata(request.snapshot),
        intentCatalog: promptIntentCatalogForLlm(),
        deterministicEvidence: scored,
      }),
      text: {
        format: {
          type: 'json_schema',
          name: 'graphcore_prompt_intent_classification',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: [
              'intent',
              'outputKind',
              'targetFormat',
              'confidence',
              'requiresConfirmation',
              'rationale',
              'alternatives',
            ],
            properties: {
              intent: { type: 'string', enum: ['world_mutation', 'output_generation', 'answer_only', 'ambiguous'] },
              outputKind: {
                type: 'string',
                enum: [
                  'concept_art_image',
                  'poster_image',
                  'story_bible_from_world',
                  'world_reference_document',
                  'lore_guide',
                  'character_dossier_pack',
                  'short_story',
                  'narrative_chapter_or_ebook',
                  'ebook_from_world',
                  'comic_issue_from_sequence',
                  'cinematic_episode',
                  'cinematic_trailer',
                  'ugc_episode',
                  'unknown',
                ],
              },
              targetFormat: { type: 'string', enum: ['pdf', 'epub', 'docx', 'markdown', 'image', 'video'] },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              requiresConfirmation: { type: 'boolean' },
              rationale: { type: 'string' },
              alternatives: {
                type: 'array',
                maxItems: 4,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['id', 'intent', 'outputKind', 'targetFormat', 'score', 'rationale'],
                  properties: {
                    id: { type: 'string' },
                    intent: { type: 'string', enum: ['world_mutation', 'output_generation', 'answer_only', 'ambiguous'] },
                    outputKind: {
                      type: 'string',
                      enum: [
                        'concept_art_image',
                        'poster_image',
                        'story_bible_from_world',
                        'world_reference_document',
                        'lore_guide',
                        'character_dossier_pack',
                        'short_story',
                        'narrative_chapter_or_ebook',
                        'ebook_from_world',
                        'comic_issue_from_sequence',
                        'cinematic_episode',
                        'cinematic_trailer',
                        'ugc_episode',
                        'unknown',
                      ],
                    },
                    targetFormat: { type: 'string', enum: ['pdf', 'epub', 'docx', 'markdown', 'image', 'video'] },
                    score: { type: 'number', minimum: 0, maximum: 1 },
                    rationale: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      maxOutputTokens: 900,
      metadata: {
        graphcore_task: 'prompt_intent_classifier',
        graphcore_source_surface: request.sourceSurface,
      },
      timeoutMs: 30_000,
    })
    if (!response.response.ok) throw new Error(`OpenAI prompt intent classifier failed with HTTP ${response.response.status}.`)
    return normalizePromptIntentClassification(JSON.parse(response.outputText), scored, 'llm')
  } catch (error) {
    return promptIntentClassificationResultSchema.parse({
      ...scored,
      rationale: `${scored.rationale}${scored.rationale ? ' ' : ''}LLM classifier fallback: ${error instanceof Error ? error.message : String(error)}`,
      classifierMode: 'scored_fallback',
    })
  }
}
