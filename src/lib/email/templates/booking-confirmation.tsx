import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import * as React from 'react'

interface BookingConfirmationEmailProps {
  userName: string
  serviceName: string
  healerName: string
  date: string
  time: string
  bookingId: string
}

export function BookingConfirmationEmail({
  userName,
  serviceName,
  healerName,
  date,
  time,
  bookingId
}: BookingConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your {serviceName} session is confirmed for {date} at {time}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Booking Confirmed! ✨</Heading>

          <Text style={text}>Hi {userName},</Text>

          <Text style={text}>
            Your {serviceName} session with {healerName} has been confirmed.
          </Text>

          <Section style={boxStyle}>
            <Text style={boldText}>📅 Date: {date}</Text>
            <Text style={boldText}>⏰ Time: {time}</Text>
            <Text style={boldText}>👤 Healer: {healerName}</Text>
            <Text style={boldText}>🎫 Booking ID: {bookingId}</Text>
          </Section>

          <Link href={`${process.env.NEXT_PUBLIC_APP_URL}/dashboard`} style={button}>
            View Your Bookings
          </Link>

          <Text style={footer}>
            Need to reschedule? You can manage your booking from your dashboard up to 24 hours before the session.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main: React.CSSProperties = { backgroundColor: '#f6f9fc', padding: '10px 0' }
const container: React.CSSProperties = { backgroundColor: '#ffffff', padding: '45px', borderRadius: '8px', margin: '0 auto', maxWidth: '600px' }
const h1: React.CSSProperties = { color: '#7c3aed', fontSize: '24px', fontWeight: '600', marginBottom: '30px' }
const text: React.CSSProperties = { color: '#333', fontSize: '16px', lineHeight: '26px', marginBottom: '16px' }
const boldText: React.CSSProperties = { color: '#333', fontSize: '16px', fontWeight: '600', marginBottom: '8px' }
const boxStyle: React.CSSProperties = { backgroundColor: '#f4f4f5', padding: '20px', borderRadius: '6px', marginBottom: '20px' }
const button: React.CSSProperties = { backgroundColor: '#7c3aed', color: '#fff', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none', display: 'inline-block', marginTop: '10px' }
const footer: React.CSSProperties = { color: '#666', fontSize: '14px', marginTop: '30px' }

export default BookingConfirmationEmail
