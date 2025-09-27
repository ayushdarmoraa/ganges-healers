import { Resend } from 'resend'
import { BookingConfirmationEmail as BookingConfirmationEmailComponent } from './templates/booking-confirmation'

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
  }
}
