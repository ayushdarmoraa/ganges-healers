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

interface QuizFollowUpEmailProps {
  name: string | null
  chakra: string
  intention: string
  productTitle: string
  productSlug: string
  siteUrl: string
}

export function QuizFollowUpEmail({
  name,
  chakra,
  intention,
  productTitle,
  productSlug,
  siteUrl,
}: QuizFollowUpEmailProps) {
  const greeting = name ? `Hi ${name}` : 'Namaste'
  const chakraLabel = chakra === 'not-sure' || !chakra ? 'your energy centers' : `your ${chakra} Chakra`
  const intentionLabel = intention
    ? intention.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'spiritual growth'
  const productUrl = `${siteUrl}/store/${productSlug}?source=quiz`

  return (
    <Html>
      <Head />
      <Preview>Your alignment window is still open — but not for long</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={emoji}>🙏</Text>
          <Heading style={h1}>Your Alignment Window Is Still Open</Heading>

          <Text style={text}>{greeting},</Text>

          <Text style={text}>
            Yesterday you discovered your sacred energy profile, but you haven&apos;t
            yet taken the next step on your journey.
          </Text>

          <Section style={reminderBox}>
            <Text style={reminderTitle}>Why This Matters</Text>
            <Text style={benefitItem}>
              ✦ Unaligned {chakraLabel} can lead to energy blockages that affect
              your daily life, relationships, and spiritual progress.
            </Text>
            <Text style={benefitItem}>
              ✦ The right sacred tool chosen for your specific intention of{' '}
              <strong>{intentionLabel}</strong> amplifies your practice immediately.
            </Text>
            <Text style={benefitItem}>
              ✦ Each day without alignment is a day your spiritual potential remains dormant.
            </Text>
          </Section>

          <Section style={productBox}>
            <Text style={productLabel}>Your recommended sacred tool:</Text>
            <Text style={productName}>{productTitle}</Text>
            <Text style={productDesc}>
              This tool was specifically matched to {chakraLabel} and your
              intention. It has been consecrated through ancient Vedic practices
              to support seekers exactly like you.
            </Text>
            <Text style={urgencyNote}>
              This sacred tool was selected for your current energy state — delaying may reduce its alignment impact.
            </Text>
            <Link href={productUrl} style={button}>
              Claim Your Sacred Tool →
            </Link>
          </Section>

          <Hr style={hr} />

          <Text style={footerText}>
            Your spiritual journey is unique. The tools aligned with your energy
            profile are waiting for you.
          </Text>

          <Link href={`${siteUrl}/store/quiz`} style={secondaryLink}>
            Retake the Energy Quiz
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
const reminderBox: React.CSSProperties = { backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '20px', borderRadius: '10px', marginBottom: '24px' }
const reminderTitle: React.CSSProperties = { color: '#991b1b', fontSize: '16px', fontWeight: '700', marginBottom: '12px' }
const benefitItem: React.CSSProperties = { color: '#555', fontSize: '15px', lineHeight: '24px', marginBottom: '8px' }
const productBox: React.CSSProperties = { backgroundColor: '#fef3c7', border: '1px solid #fcd34d', padding: '24px', borderRadius: '10px', marginBottom: '24px', textAlign: 'center' }
const productLabel: React.CSSProperties = { color: '#92400e', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }
const productName: React.CSSProperties = { color: '#92400e', fontSize: '22px', fontWeight: '700', marginBottom: '10px' }
const productDesc: React.CSSProperties = { color: '#555', fontSize: '14px', lineHeight: '22px', marginBottom: '16px' }
const urgencyNote: React.CSSProperties = { color: '#92400e', fontSize: '13px', fontStyle: 'italic', lineHeight: '20px', marginBottom: '14px' }
const button: React.CSSProperties = { backgroundColor: '#d97706', color: '#fff', padding: '14px 28px', borderRadius: '8px', textDecoration: 'none', display: 'inline-block', fontWeight: '600', fontSize: '16px' }
const hr: React.CSSProperties = { borderColor: '#e5e7eb', margin: '24px 0' }
const footerText: React.CSSProperties = { color: '#888', fontSize: '14px', lineHeight: '22px', textAlign: 'center' }
const secondaryLink: React.CSSProperties = { color: '#d97706', fontSize: '14px', textDecoration: 'underline', display: 'block', textAlign: 'center', marginTop: '8px' }

export default QuizFollowUpEmail
