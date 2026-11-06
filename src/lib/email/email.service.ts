import { Resend } from 'resend'
import { BookingConfirmationEmail as BookingConfirmationEmailComponent } from './templates/booking-confirmation'
import { QuizAlignmentEmail } from './templates/quiz-alignment'
import { QuizFollowUpEmail } from './templates/quiz-follow-up'
import { AbandonedCartEmail } from './templates/abandoned-cart'

const resendApiKey = process.env.RESEND_API_KEY
const disabled = !resendApiKey

const resend = disabled ? null : new Resend(resendApiKey)

function safeLogError(scope: string, error: unknown) {
  // Avoid throwing in production paths due to email issues; just log.
  console.error(`[Email:${scope}]`, error)
}

export const emailService = {
  isEnabled() {
    return !disabled
  },

  async sendEmailVerification(data: { to: string; link: string }) {
    if (disabled || !resend) return { success: false, disabled: true }
    try {
      const href = data.link.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
      const result = await resend.emails.send({
        from: 'Ganges Healers <noreply@gangeshealers.com>',
        to: data.to,
        subject: 'Verify your Ganges Healers email',
        html: `<h2>Verify your email</h2><p>Confirm this email address for your Ganges Healers account.</p><p><a href="${href}">Verify email</a></p><p>This link expires in 30 minutes and can be used once. If you did not request this, you can ignore this email.</p>`,
      })
      return { success: !result.error && Boolean(result.data?.id) }
    } catch {
      console.error('[auth][email-verification][email-error]')
      return { success: false }
    }
  },

  async sendPasswordReset(data: { to: string; link: string }) {
    if (disabled || !resend) return { success: false, disabled: true }
    try {
      const href = data.link.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
      const result = await resend.emails.send({
        from: 'Ganges Healers <noreply@gangeshealers.com>',
        to: data.to,
        subject: 'Reset your Ganges Healers password',
        html: `<h2>Reset your password</h2><p>A password reset was requested for your Ganges Healers account.</p><p><a href="${href}">Choose a new password</a></p><p>This link expires in 15 minutes and can be used once. If you did not request this, you can ignore this email.</p>`,
      })
      // Resend reports provider failures in result.error without necessarily throwing.
      return { success: !result.error && Boolean(result.data?.id) }
    } catch {
      console.error('[auth][password-reset][email-error]')
      return { success: false }
    }
  },

  async sendBookingConfirmation(data: {
    to: string
    userName: string
    serviceName: string
    healerName: string
    date: string
    time: string
    bookingId: string
  }) {
    if (disabled || !resend) {
      return { success: false, disabled: true }
    }
    try {
      const result = await resend.emails.send({
        from: 'Ganges Healers <noreply@gangeshealers.com>',
        to: data.to,
        subject: `Booking Confirmed - ${data.serviceName} on ${data.date}`,
        react: BookingConfirmationEmailComponent(data)
      })
      return { success: true, id: result.data?.id }
    } catch (error) {
      safeLogError('sendBookingConfirmation', error)
      return { success: false, error }
    }
  },

  async sendBookingCancellation(data: {
    to: string
    userName: string
    serviceName: string
    date: string
    time: string
  }) {
    if (disabled || !resend) {
      return { success: false, disabled: true }
    }
    try {
      const result = await resend.emails.send({
        from: 'Ganges Healers <noreply@gangeshealers.com>',
        to: data.to,
        subject: 'Booking Cancelled',
        html: `
          <h2>Booking Cancelled</h2>
          <p>Hi ${data.userName},</p>
          <p>Your ${data.serviceName} session scheduled for ${data.date} at ${data.time} has been cancelled.</p>
          <p>If you didn't request this cancellation, please contact us immediately.</p>
        `
      })
      return { success: true, id: result.data?.id }
    } catch (error) {
      safeLogError('sendBookingCancellation', error)
      return { success: false, error }
    }
  },

  async sendBookingReminder(data: {
    to: string
    userName: string
    serviceName: string
    healerName: string
    date: string
    time: string
    bookingId: string
  }) {
    if (disabled || !resend) {
      return { success: false, disabled: true }
    }
    try {
      const result = await resend.emails.send({
        from: 'Ganges Healers <noreply@gangeshealers.com>',
        to: data.to,
        subject: `Reminder: ${data.serviceName} tomorrow at ${data.time}`,
        html: `
          <h2>Session Reminder</h2>
          <p>Hi ${data.userName},</p>
          <p>This is a reminder about your upcoming ${data.serviceName} session:</p>
          <ul>
            <li>Date: ${data.date}</li>
            <li>Time: ${data.time}</li>
            <li>Healer: ${data.healerName}</li>
          </ul>
          <p>We look forward to seeing you!</p>
        `
      })
      return { success: true, id: result.data?.id }
    } catch (error) {
      safeLogError('sendBookingReminder', error)
      return { success: false, error }
    }
  }

  ,async sendInvoiceEmail(data: { to: string; invoiceNumber: string; amountPaise: number; link: string }) {
    if (disabled || !resend) {
      console.warn('[invoice][generate][email_skipped]', { invoiceNumber: data.invoiceNumber })
      return { success: false, disabled: true }
    }
    try {
      const result = await resend.emails.send({
        from: 'Ganges Healers <noreply@gangeshealers.com>',
        to: data.to,
        subject: `Your Invoice ${data.invoiceNumber}`,
        html: `
          <h2>Invoice ${data.invoiceNumber}</h2>
          <p>Amount: INR ${(data.amountPaise/100).toFixed(2)}</p>
          <p>You can download your invoice here:</p>
          <p><a href="${data.link}">${data.link}</a></p>
          <p>Thank you for your purchase.</p>
        `
      })
      console.log('[invoice][generate][email_sent]', { invoiceNumber: data.invoiceNumber })
      return { success: true, id: result.data?.id }
    } catch (error) {
      console.warn('[invoice][generate][email_failed]', { invoiceNumber: data.invoiceNumber, error })
      return { success: false, error }
    }
  },

  async sendQuizAlignment(data: {
    to: string
    name: string | null
    chakra: string
    intention: string
    productTitle: string
    productSlug: string
    supportingProducts?: { title: string; slug: string; chakra: string | null; pricePaise: number }[]
  }) {
    if (disabled || !resend) {
      return { success: false, disabled: true }
    }
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://gangeshealers.com'
    try {
      const result = await resend.emails.send({
        from: 'Ganges Healers <noreply@gangeshealers.com>',
        to: data.to,
        subject: 'Your Sacred Energy Alignment ✨',
        react: QuizAlignmentEmail({ ...data, siteUrl }),
      })
      return { success: true, id: result.data?.id }
    } catch (error) {
      safeLogError('sendQuizAlignment', error)
      return { success: false, error }
    }
  },

  async sendQuizFollowUp(data: {
    to: string
    name: string | null
    chakra: string
    intention: string
    productTitle: string
    productSlug: string
  }) {
    if (disabled || !resend) {
      return { success: false, disabled: true }
    }
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://gangeshealers.com'
    try {
      const result = await resend.emails.send({
        from: 'Ganges Healers <noreply@gangeshealers.com>',
        to: data.to,
        subject: 'Your alignment window is still open ✨',
        react: QuizFollowUpEmail({ ...data, siteUrl }),
      })
      return { success: true, id: result.data?.id }
    } catch (error) {
      safeLogError('sendQuizFollowUp', error)
      return { success: false, error }
    }
  },

  async sendAbandonedCartRecovery(data: {
    to: string
    productTitle: string
    productSlug: string
    chakra: string | null
    intention: string | null
  }) {
    if (disabled || !resend) {
      return { success: false, disabled: true }
    }
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://gangeshealers.com'
    try {
      const result = await resend.emails.send({
        from: 'Ganges Healers <noreply@gangeshealers.com>',
        to: data.to,
        subject: 'Your sacred tool is still waiting for you ✨',
        react: AbandonedCartEmail({ ...data, siteUrl }),
      })
      return { success: true, id: result.data?.id }
    } catch (error) {
      safeLogError('sendAbandonedCartRecovery', error)
      return { success: false, error }
    }
  }
}
