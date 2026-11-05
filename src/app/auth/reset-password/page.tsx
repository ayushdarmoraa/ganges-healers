import type { Metadata } from 'next'
import { Suspense } from 'react'
import PasswordResetForm from '@/components/auth/password-reset-form'

export const metadata: Metadata = {
  title: 'Password recovery | Ganges Healers',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function PasswordResetPage() {
  return <div className="container mx-auto max-w-md px-4 py-16"><Suspense fallback={<p role="status">Loading password recovery…</p>}><PasswordResetForm /></Suspense></div>
}
