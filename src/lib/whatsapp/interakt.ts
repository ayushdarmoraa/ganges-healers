const apiKey = process.env.INTERAKT_API_KEY
const disabled = !apiKey
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://gangeshealers.com'

interface QuizRecommendationParams {
  phone: string
  productTitle: string
  productSlug: string
  chakra: string
  intention: string
}

/**
 * Sends a single WhatsApp message via Interakt with the quiz-recommended product.
 * Idempotent — caller is responsible for checking whatsappSentAt before calling.
 */
export async function sendWhatsAppQuizRecommendation(
  params: QuizRecommendationParams,
): Promise<{ success: boolean; error?: unknown }> {
  if (disabled) {
    console.warn('[whatsapp] Interakt API key not configured, skipping')
    return { success: false, error: 'disabled' }
  }

  const { phone, productTitle, productSlug, chakra, intention } = params
  const chakraLabel = chakra && chakra !== 'not-sure' ? chakra : 'your energy centers'
  const intentionLabel = intention
    ? intention.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'spiritual growth'
  const productUrl = `${siteUrl}/store/${productSlug}?source=whatsapp`

  const bodyText = [
    `Hey, your sacred tool is ready ✨`,
    ``,
    `Based on your intention for ${intentionLabel}, this ${chakraLabel} tool is most aligned for you:`,
    ``,
    `🔮 ${productTitle}`,
    ``,
    `This piece has been consecrated to support your journey. This alignment is strongest right now — trust your intuition 🙏`,
    ``,
    productUrl,
  ].join('\n')

  try {
    const res = await fetch('https://api.interakt.ai/v1/public/message/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        countryCode: phone.startsWith('+') ? phone.slice(1, 3) : '91',
        phoneNumber: phone.replace(/^\+?\d{1,2}/, ''),
        callbackData: 'quiz-recommendation',
        type: 'Text',
        data: {
          message: bodyText,
        },
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown')
      console.error('[whatsapp] Interakt API error:', res.status, text)
      return { success: false, error: text }
    }

    const data = await res.json()
    console.log('[whatsapp] Message sent via Interakt:', data)
    return { success: true }
  } catch (error) {
    console.error('[whatsapp] Interakt request failed:', error)
    return { success: false, error }
  }
}

interface AbandonedCartParams {
  phone: string
  productTitle: string
  productSlug: string
  chakra?: string | null
  intention?: string | null
}

/**
 * Sends a WhatsApp recovery message for an abandoned cart.
 * Only the primary (first) product is highlighted.
 */
export async function sendWhatsAppAbandonedCart(
  params: AbandonedCartParams,
): Promise<{ success: boolean; error?: unknown }> {
  if (disabled) {
    console.warn('[whatsapp] Interakt API key not configured, skipping')
    return { success: false, error: 'disabled' }
  }

  const { phone, productTitle, productSlug, chakra, intention } = params
  const productUrl = `${siteUrl}/store/${productSlug}?source=whatsapp`

  const chakraLabel = chakra && chakra !== 'not-sure' ? chakra : null
  const intentionLabel = intention
    ? intention.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null

  const personalLine = chakraLabel && intentionLabel
    ? `You were drawn to this ${chakraLabel} Chakra tool for ${intentionLabel}.`
    : 'You were drawn to this sacred tool.'

  const bodyText = [
    `${personalLine} ✨`,
    ``,
    `It's still available for you:`,
    `🔮 ${productTitle}`,
    ``,
    `Complete your alignment:`,
    productUrl,
  ].join('\n')

  try {
    const res = await fetch('https://api.interakt.ai/v1/public/message/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        countryCode: phone.startsWith('+') ? phone.slice(1, 3) : '91',
        phoneNumber: phone.replace(/^\+?\d{1,2}/, ''),
        callbackData: 'abandoned-cart',
        type: 'Text',
        data: {
          message: bodyText,
        },
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown')
      console.error('[whatsapp] Abandoned cart API error:', res.status, text)
      return { success: false, error: text }
    }

    const data = await res.json()
    console.log('[whatsapp] Abandoned cart message sent:', data)
    return { success: true }
  } catch (error) {
    console.error('[whatsapp] Abandoned cart request failed:', error)
    return { success: false, error }
  }
}

/**
 * Sends a final WhatsApp reminder (48h) for an abandoned cart.
 * Stronger urgency language.
 */
export async function sendWhatsAppFinalReminder(
  params: AbandonedCartParams,
): Promise<{ success: boolean; error?: unknown }> {
  if (disabled) {
    console.warn('[whatsapp] Interakt API key not configured, skipping')
    return { success: false, error: 'disabled' }
  }

  const { phone, productTitle, productSlug, chakra } = params
  const productUrl = `${siteUrl}/store/${productSlug}?source=whatsapp`

  const chakraLabel = chakra && chakra !== 'not-sure' ? `${chakra} Chakra` : 'energy'

  const bodyText = [
    `This is your final reminder 🙏`,
    ``,
    `🔮 ${productTitle}`,
    ``,
    `This ${chakraLabel} tool won't stay available forever. Trust what drew you to it.`,
    ``,
    productUrl,
  ].join('\n')

  try {
    const res = await fetch('https://api.interakt.ai/v1/public/message/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        countryCode: phone.startsWith('+') ? phone.slice(1, 3) : '91',
        phoneNumber: phone.replace(/^\+?\d{1,2}/, ''),
        callbackData: 'abandoned-cart-final',
        type: 'Text',
        data: {
          message: bodyText,
        },
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown')
      console.error('[whatsapp] Final reminder API error:', res.status, text)
      return { success: false, error: text }
    }

    const data = await res.json()
    console.log('[whatsapp] Final reminder sent:', data)
    return { success: true }
  } catch (error) {
    console.error('[whatsapp] Final reminder request failed:', error)
    return { success: false, error }
  }
}
