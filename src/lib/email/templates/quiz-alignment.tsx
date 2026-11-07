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

interface SupportingProduct {
  title: string
  slug: string
  chakra: string | null
  pricePaise: number
}

interface QuizAlignmentEmailProps {
  name: string | null
  chakra: string
  intention: string
  productTitle: string
  productSlug: string
  siteUrl: string
  supportingProducts?: SupportingProduct[]
}

export function QuizAlignmentEmail({
  name,
  chakra,
  intention,
  productTitle,
  productSlug,
  siteUrl,
  supportingProducts = [],
}: QuizAlignmentEmailProps) {
  const greeting = name ? `Hi ${name}` : 'Namaste'
  const chakraLabel = chakra === 'not-sure' || !chakra ? 'Universal Alignment' : `${chakra} Chakra`
  const intentionLabel = intention
    ? intention.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Spiritual Growth'
  const productUrl = `${siteUrl}/store/${productSlug}?source=quiz`

  return (
    <Html>
      <Head />
      <Preview>Your sacred energy alignment is ready — {chakraLabel} focus</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={emoji}>✨</Text>
          <Heading style={h1}>Your Sacred Energy Alignment</Heading>

          <Text style={text}>{greeting},</Text>

          <Text style={text}>
            Thank you for taking the Energy Alignment Quiz. Based on your responses,
            we&apos;ve identified your spiritual energy profile.
          </Text>

          <Section style={profileBox}>
            <Text style={profileLabel}>Your Energy Profile</Text>
            <Text style={profileItem}>🎯 Intention: <strong>{intentionLabel}</strong></Text>
            <Text style={profileItem}>🔮 Chakra Focus: <strong>{chakraLabel}</strong></Text>
          </Section>

          <Text style={text}>
            Based on your energy alignment, we recommend:
          </Text>

          <Section style={productBox}>
            <Text style={productName}>{productTitle}</Text>
            <Text style={productDesc}>
              This sacred tool has been specifically identified as most aligned with
              your {chakraLabel.toLowerCase()} energy and your intention of {intentionLabel.toLowerCase()}.
            </Text>
            <Link href={productUrl} style={button}>
              View Your Recommended Tool →
            </Link>
          </Section>

          {supportingProducts.length > 0 && (
            <Section style={supportingSection}>
              <Text style={supportingTitle}>Supporting Your Energy Alignment</Text>
              <Text style={supportingSubtitle}>
                These sacred tools complement your primary recommendation for a
                complete spiritual practice.
              </Text>
              {supportingProducts.map((sp) => (
                <Section key={sp.slug} style={supportingItem}>
                  <Link href={`${siteUrl}/store/${sp.slug}?source=quiz`} style={supportingLink}>
                    <Text style={supportingName}>{sp.title}</Text>
                  </Link>
                  <Text style={supportingMeta}>
                    {sp.chakra ? `${sp.chakra} Chakra` : 'Universal Alignment'}
                    {' · '}
                    ₹{(sp.pricePaise / 100).toFixed(2)}
                  </Text>
                </Section>
              ))}
            </Section>
          )}

          <Hr style={hr} />

          <Text style={footerText}>
            Every sacred tool in our collection is selected and consecrated through
            ancient Vedic practices to support your spiritual journey.
          </Text>

          <Link href={`${siteUrl}/store`} style={secondaryLink}>
            Browse All Sacred Tools
          </Link>
        </Container>
      </Body>
    </Html>
  )
}

const main: React.CSSProperties = { backgroundColor: '#fdf8f0', padding: '20px 0' }
const container: React.CSSProperties = { backgroundColor: '#ffffff', padding: '40px', borderRadius: '12px', margin: '0 auto', maxWidth: '600px' }
const emoji: React.CSSProperties = { fontSize: '40px', textAlign: 'center', margin: '0 0 10px' }
const h1: React.CSSProperties = { color: '#92400e', fontSize: '24px', fontWeight: '700', textAlign: 'center', marginBottom: '24px' }
const text: React.CSSProperties = { color: '#444', fontSize: '16px', lineHeight: '26px', marginBottom: '16px' }
const profileBox: React.CSSProperties = { backgroundColor: '#fffbeb', border: '1px solid #fde68a', padding: '20px', borderRadius: '10px', marginBottom: '24px' }
const profileLabel: React.CSSProperties = { color: '#92400e', fontSize: '14px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }
const profileItem: React.CSSProperties = { color: '#444', fontSize: '16px', marginBottom: '6px' }
const productBox: React.CSSProperties = { backgroundColor: '#fef3c7', border: '1px solid #fcd34d', padding: '24px', borderRadius: '10px', marginBottom: '24px', textAlign: 'center' }
const productName: React.CSSProperties = { color: '#92400e', fontSize: '20px', fontWeight: '700', marginBottom: '8px' }
const productDesc: React.CSSProperties = { color: '#555', fontSize: '14px', lineHeight: '22px', marginBottom: '16px' }
const button: React.CSSProperties = { backgroundColor: '#d97706', color: '#fff', padding: '14px 28px', borderRadius: '8px', textDecoration: 'none', display: 'inline-block', fontWeight: '600', fontSize: '16px' }
const supportingSection: React.CSSProperties = { marginBottom: '24px' }
const supportingTitle: React.CSSProperties = { color: '#92400e', fontSize: '18px', fontWeight: '700', marginBottom: '4px' }
const supportingSubtitle: React.CSSProperties = { color: '#888', fontSize: '13px', lineHeight: '20px', marginBottom: '16px' }
const supportingItem: React.CSSProperties = { backgroundColor: '#fffbeb', border: '1px solid #fde68a', padding: '14px 18px', borderRadius: '8px', marginBottom: '10px' }
const supportingLink: React.CSSProperties = { textDecoration: 'none' }
const supportingName: React.CSSProperties = { color: '#92400e', fontSize: '16px', fontWeight: '600', marginBottom: '2px' }
const supportingMeta: React.CSSProperties = { color: '#777', fontSize: '13px', margin: '0' }
const hr: React.CSSProperties = { borderColor: '#e5e7eb', margin: '24px 0' }
const footerText: React.CSSProperties = { color: '#888', fontSize: '14px', lineHeight: '22px', textAlign: 'center' }
const secondaryLink: React.CSSProperties = { color: '#d97706', fontSize: '14px', textDecoration: 'underline', display: 'block', textAlign: 'center', marginTop: '8px' }

export default QuizAlignmentEmail
