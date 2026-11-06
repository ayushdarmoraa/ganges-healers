import type { Metadata } from 'next'
import EmailVerificationForm from '@/components/auth/EmailVerificationForm'

export const metadata: Metadata = { title: 'Verify email | Ganges Healers', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default function VerifyEmailPage() {
  return <div className="container mx-auto max-w-md px-4 py-16"><EmailVerificationForm /></div>
}
