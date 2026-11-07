import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import * as React from 'react'

interface AbandonedCartEmailProps {
  productTitle: string
  productSlug: string
  chakra: string | null
  intention: string | null
  siteUrl: string
}

export function AbandonedCartEmail({
  productTitle,
  productSlug,
  chakra,
  intention,
  siteUrl,
}: AbandonedCartEmailProps) {
  const chakraLabel = chakra && chakra !== 'not-sure' ? `your ${chakra} Chakra` : 'your energy centers'
  const intentionLabel = intention
    ? intention.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'your spiritual journey'
  const productUrl = `${siteUrl}/store/${productSlug}?source=email`

  return (
    <Html>
      <Head />
      <Preview>Your sacred tool is still waiting for you ✨</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={emoji}>✨</Text>
          <Heading style={h1}>You Were So Close to Alignment</Heading>

          <Text style={text}>
            You were drawn to <strong>{productTitle}</strong> — a tool chosen to support
            {' '}{chakraLabel} and your intention for {intentionLabel}.
          </Text>

          <Text style={text}>
            This wasn&apos;t random. Your energy recognized what it needs.
          </Text>

          <Section style={ctaSection}>
            <Link href={productUrl} style={cta}>
              Complete Your Alignment →
            </Link>
          </Section>

          <Hr style={hr} />

          <Text style={footerText}>
            Ganges Healers · Sacred tools for your spiritual journey
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#faf9f6', fontFamily: 'Georgia, serif' }
const container = { maxWidth: '520px', margin: '0 auto', padding: '40px 20px' }
const emoji = { fontSize: '36px', textAlign: 'center' as const, margin: '0 0 16px' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, textAlign: 'center' as const, color: '#1a1a1a', margin: '0 0 24px' }
const text = { fontSize: '16px', lineHeight: '1.6', color: '#333', margin: '0 0 16px' }
const ctaSection = { textAlign: 'center' as const, margin: '24px 0' }
const cta = { backgroundColor: '#d97706', color: '#fff', padding: '14px 28px', borderRadius: '8px', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: '#e5e5e5', margin: '32px 0 16px' }
const footerText = { fontSize: '12px', color: '#999', textAlign: 'center' as const }
