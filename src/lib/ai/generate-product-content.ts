import OpenAI from 'openai'

export class AIContentNotConfiguredError extends Error {
  constructor() {
    super('AI content generation is not configured.')
    this.name = 'AIContentNotConfiguredError'
  }
}

export interface ProductContentInput {
  title: string
  category: string
  chakra: string
  material: string
  purpose: string
}

export interface ProductContentOutput {
  shortDescription: string
  longDescription: string
  spiritualBenefits: string[]
  ritualUse: string[]
  consecrationStory: string
}

export async function generateProductContent(
  input: ProductContentInput,
): Promise<ProductContentOutput> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new AIContentNotConfiguredError()
  // The optional SDK client must not be constructed while Next collects routes.
  const openai = new OpenAI({ apiKey })
  const prompt = `You are a spiritual product copywriter for a sacred healing store. Generate product content for:

Product: ${input.title}
Category: ${input.category}
Chakra: ${input.chakra}
Material: ${input.material}
Purpose: ${input.purpose}

Return a JSON object with exactly these keys:
- "shortDescription": A one-line spiritual tagline (max 120 chars)
- "longDescription": A 2-3 sentence spiritual product description highlighting energy properties and sacred significance
- "spiritualBenefits": An array of 3-5 concise spiritual benefits (each 3-8 words)
- "ritualUse": An array of 3-5 brief ritual usage instructions (each 3-10 words, start with a verb)
- "consecrationStory": A 2-3 sentence narrative about how this product is energetically purified through sacred meditation and sound vibration before dispatch

Return ONLY valid JSON, no markdown fences or extra text.`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 600,
  })

  const text = response.choices[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty AI response')

  const parsed = JSON.parse(text) as Record<string, unknown>

  return {
    shortDescription: String(parsed.shortDescription ?? ''),
    longDescription: String(parsed.longDescription ?? ''),
    spiritualBenefits: Array.isArray(parsed.spiritualBenefits)
      ? parsed.spiritualBenefits.map(String)
      : [],
    ritualUse: Array.isArray(parsed.ritualUse)
      ? parsed.ritualUse.map(String)
      : [],
    consecrationStory: String(parsed.consecrationStory ?? ''),
  }
}
