import type { Metadata } from "next"
import Link from "next/link"
import { RegisterForm } from "@/components/auth/register-form"
import { authPathWithCallback, safeCallbackUrl } from '@/lib/auth/callback-url'

export const metadata: Metadata = {
  title: "Create Account — Ganges Healers",
  description:
    "Sign up for a free Ganges Healers account to book healing sessions, enroll in programs, and access the community.",
}

export default async function RegisterPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const callbackUrl = safeCallbackUrl((await searchParams)?.callbackUrl)
  return (
    <div className="container mx-auto px-4 py-16 max-w-md">
      <RegisterForm callbackUrl={callbackUrl} />
      <div className="text-center mt-6">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link 
            href={authPathWithCallback('/auth/signin', callbackUrl)}
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
