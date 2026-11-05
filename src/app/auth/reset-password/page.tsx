import type { Metadata } from 'next'
import PasswordRecoveryForm from '@/components/auth/password-recovery-form'
import { safeCallbackUrl } from '@/lib/auth/callback-url'

export const metadata: Metadata = { title: 'Reset your password | Ganges Healers', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams
  // The secret arrives in the email URL fragment, which is read and cleared in the client form.
  return <PasswordRecoveryForm mode="reset" callbackUrl={safeCallbackUrl(query.callbackUrl)} />
}
