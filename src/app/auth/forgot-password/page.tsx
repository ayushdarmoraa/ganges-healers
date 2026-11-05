import type { Metadata } from 'next'
import PasswordRecoveryForm from '@/components/auth/password-recovery-form'
import { safeCallbackUrl } from '@/lib/auth/callback-url'

export const metadata: Metadata = { title: 'Recover your password | Ganges Healers', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams
  return <PasswordRecoveryForm mode="request" callbackUrl={safeCallbackUrl(query.callbackUrl)} />
}
