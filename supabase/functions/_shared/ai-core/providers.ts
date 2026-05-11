import { Registry } from './registry.ts'
import { OpenAiProvider } from './providers/openai.ts'
import { FalProvider } from './providers/fal.ts'
import { AnthropicProvider } from './providers/anthropic.ts'
import { GoogleProvider } from './providers/google.ts'
import { GroqProvider } from './providers/groq.ts'
import { OpenRouterProvider } from './providers/openrouter.ts'

let registered = false

export function registerBuiltInProviders() {
  if (registered) return
  Registry.register(new OpenAiProvider())
  Registry.register(new FalProvider())
  Registry.register(new AnthropicProvider())
  Registry.register(new GoogleProvider())
  Registry.register(new GroqProvider())
  Registry.register(new OpenRouterProvider())
  registered = true
}
