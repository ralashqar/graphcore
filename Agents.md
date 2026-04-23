# GraphCore AI Agents

This document outlines the AI agents and autonomous systems that power GraphCore's content generation, game authoring, and UGC creation capabilities.

## Overview

GraphCore employs multiple specialized AI agents working in concert to transform natural language prompts into structured game content. The system uses a layered architecture where different agents handle specific aspects of content creation, from initial concept generation to detailed asset production.

## Maintenance Requirements

**CRITICAL**: This document must be kept current whenever changes are made to the AI agent infrastructure. Update requirements:

- **New Agents**: When adding new AI agents, document their purpose, capabilities, integration patterns, and supported models
- **Agent Modifications**: Update capabilities, models, and workflows when agents are enhanced or modified
- **Infrastructure Changes**: Document changes to Supabase Edge Functions, provider integrations, or orchestration patterns
- **Model Updates**: Track new model support, deprecated models, and performance characteristics
- **API Changes**: Update function signatures, request/response formats, and error handling
- **Configuration Updates**: Document new environment variables, secrets, or configuration options
- **Performance Changes**: Update latency expectations, throughput capabilities, and cost implications
- **Security Updates**: Document security enhancements, authentication changes, or access control modifications

**Review Process**: All pull requests that modify AI agent code, Supabase functions, or agent orchestration logic must include corresponding updates to this document.

## Core AI Infrastructure

### Supabase Edge Functions
GraphCore runs AI workloads through protected Supabase Edge Functions that provide secure, authenticated access to external AI providers.

#### `ai-openai` Function
**Purpose**: General-purpose LLM interactions for content generation, reasoning, and structured data extraction.

**Capabilities**:
- OpenAI Responses API integration
- JSON schema validation and structured outputs
- Multi-modal content processing
- Reasoning effort control (low/medium/high)
- Tool calling and function execution
- Token usage tracking and optimization

**Models Supported**:
- GPT-4, GPT-4 Turbo
- GPT-3.5 Turbo
- Custom fine-tuned models
- Reasoning models (o1, o3-mini)

**Use Cases**:
- Graph structure generation
- Content archetype creation
- Narrative script writing
- UGC psychology optimization
- Patch operation planning

#### `ai-fal` Function
**Purpose**: Visual asset generation and image manipulation using Fal.ai's queue-based processing system.

**Capabilities**:
- Asynchronous job queuing and status polling
- Image generation from text prompts
- Image-to-image editing and manipulation
- Batch processing with priority controls
- Webhook notifications for job completion
- Multiple output formats (PNG, JPEG, WebP)

**Models Supported**:
- `fal-ai/nano-banana-2` (primary image generation)
- `fal-ai/nano-banana-2/edit` (image editing)
- Custom fine-tuned vision models
- Style transfer and enhancement models

**Use Cases**:
- Character concept art generation
- Environment visualization
- Item and asset previews
- Cinematic storyboard creation
- UGC thumbnail and banner creation

## Specialized Content Agents

### Prompt-to-Patch Agent (`prompt-patch`)
**Purpose**: Orchestrates the conversion of natural language prompts into structured game content patches.

**Architecture**:
- Multi-pass generation strategy
- Content pass → Graph pass separation
- Validation and repair layers
- Patch proposal and review workflow

**Capabilities**:
- Natural language understanding for game design
- Structured patch generation (JSON operations)
- Content scaffolding and archetype reuse
- Graph relationship modeling
- Error correction and validation

**Workflow**:
1. **Content Pass**: Creates or reuses content definitions (items, characters, locations)
2. **Graph Pass**: Builds narrative graphs, choices, and relationships
3. **Validation**: Ensures patch integrity and compatibility
4. **Proposal**: Stores patch for user review and approval

### Visual Asset Generation Agent
**Purpose**: Creates visual assets for game content using AI image generation.

**Capabilities**:
- Concept art generation from text descriptions
- Character portrait creation
- Environment visualization
- Item and prop design
- Style consistency across assets

**Integration**:
- Automatic prompt enhancement for better results
- Reference image incorporation
- Aspect ratio optimization for different use cases
- Resolution scaling (1K, 2K, 4K outputs)

### Cinematic Script Agent
**Purpose**: Generates cinematic content and video scripts optimized for UGC engagement.

**Capabilities**:
- Script writing with psychological hooks
- Storyboard generation
- Scene composition and timing
- Character dialogue optimization
- Viral content structure implementation

**Special Features**:
- Attention psychology integration
- Conversion mechanism embedding
- Scroll-stopper implementation
- Platform-specific formatting

### World Building Agent
**Purpose**: Procedurally generates game worlds, environments, and interconnected content systems.

**Capabilities**:
- Environment assembly and structural fusion
- World entity relationship modeling
- Terrain and geography generation
- Cultural and societal system creation
- Quest and narrative thread weaving

**Advanced Features**:
- Multi-scale world construction (local → regional → global)
- Entity relationship inference
- World state consistency checking
- Dynamic content expansion

### UGC Psychology Agent
**Purpose**: Applies research-backed psychological principles to optimize content for viral spread and user engagement.

**Capabilities**:
- Attention capture mechanisms
- Identity protection framing
- Knowledge gap creation
- Loss aversion messaging
- Vicarious skepticism handling

**Content Optimization**:
- Hook strength analysis
- Conversion funnel design
- Platform-specific adaptation
- A/B testing recommendations

## Agent Orchestration

### Service Layer Integration
AI agents are orchestrated through GraphCore's application services:

```typescript
// Example: Prompt generation service
export const promptGenerationService = {
  generate: (request: PromptPatchRequest) =>
    graphcoreWorkspaceAdapter.proposePatch(request),
}

// Example: Visual asset service
export const visualAssetGenerationService = {
  generateConceptImage: (request) =>
    visualAssetAdapter.generateConceptImage(request),
}
```

### Multi-Agent Coordination
Complex content generation involves coordinated agent execution:

1. **Planning Phase**: UGC Psychology Agent analyzes target audience and platform
2. **Content Phase**: Prompt-to-Patch Agent creates structured content
3. **Visual Phase**: Visual Asset Agent generates accompanying imagery
4. **Cinematic Phase**: Script Agent creates video content
5. **Optimization Phase**: Psychology Agent refines for maximum engagement

### Error Handling and Recovery
- Automatic retry logic for transient failures
- Fallback strategies for unavailable providers
- Partial result recovery and continuation
- User-friendly error messaging

## Agent Capabilities Matrix

| Agent | Text Generation | Image Generation | Structured Data | UGC Optimization | Real-time Processing |
|-------|----------------|------------------|-----------------|------------------|---------------------|
| OpenAI Agent | ✅ | ❌ | ✅ | ✅ | ✅ |
| Fal.ai Agent | ❌ | ✅ | ❌ | ❌ | ❌ (async) |
| Prompt-to-Patch | ✅ | ❌ | ✅ | ✅ | ❌ |
| Visual Assets | ❌ | ✅ | ❌ | ❌ | ❌ |
| Cinematics | ✅ | ✅ | ✅ | ✅ | ❌ |
| World Building | ✅ | ✅ | ✅ | ❌ | ❌ |
| UGC Psychology | ✅ | ❌ | ✅ | ✅ | ✅ |

## Configuration and Secrets

### Environment Setup
AI agents require provider credentials stored as Supabase secrets:

```bash
# OpenAI configuration
npx supabase secrets set OPENAI_API_KEY=your_key
npx supabase secrets set OPENAI_BASE_URL=https://api.openai.com/v1

# Fal.ai configuration
npx supabase secrets set FAL_KEY=your_fal_key
```

### Model Selection
Agents support dynamic model selection based on task requirements:

- **Creative Tasks**: GPT-4 with high temperature for ideation
- **Structured Tasks**: GPT-4 with JSON schema for reliable outputs
- **Fast Tasks**: GPT-3.5 Turbo for quick iterations
- **Reasoning Tasks**: o1 models for complex planning

## Monitoring and Observability

### Usage Tracking
- Token consumption monitoring
- Request latency tracking
- Success/failure rate analysis
- Cost optimization insights

### Quality Metrics
- Content coherence scoring
- User engagement correlation
- Conversion rate tracking
- A/B test performance analysis

## Future Agent Developments

### Planned Enhancements
- **Multi-modal Agents**: Combined text + image + video generation
- **Real-time Collaboration**: Multi-user content co-creation
- **Personalization Agents**: User preference learning and adaptation
- **Quality Assurance Agents**: Automated content validation and improvement
- **Market Analysis Agents**: Competitive content analysis and optimization

### Research Areas
- Advanced prompt engineering techniques
- Cross-platform content adaptation
- Cultural context awareness
- Accessibility optimization
- Performance prediction models

## Agent Development Guidelines

### Adding New Agents
1. Define clear scope and capabilities
2. Implement proper error handling and recovery
3. Add comprehensive logging and monitoring
4. Include usage tracking and cost analysis
5. Provide fallback strategies for failures
6. Document integration patterns and APIs

### Testing Strategies
- Unit tests for agent logic
- Integration tests for provider APIs
- End-to-end tests for complete workflows
- Performance benchmarks and load testing
- Failure scenario simulation and recovery testing

## Troubleshooting

### Common Issues
- **Rate Limiting**: Implement exponential backoff and request queuing
- **Token Limits**: Chunk large requests and optimize prompt length
- **API Errors**: Provide user-friendly error messages and retry logic
- **Cost Control**: Monitor usage and implement budget limits

### Debug Tools
- Request/response logging in development
- Agent performance dashboards
- Error tracking and alerting
- Usage analytics and reporting

---

*This document is maintained alongside the GraphCore codebase. For implementation details, see the source code in `src/domain/`, `src/data/`, and `supabase/functions/`.*