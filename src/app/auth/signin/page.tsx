"use client"

import { getProviders, signIn } from "next-auth/react"
import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { authPathWithCallback, safeCallbackUrl } from '@/lib/auth/callback-url'

export default function SignInPage() {
  return <Suspense fallback={<div className="container mx-auto max-w-md px-4 py-16">Loading sign-in…</div>}><SignInContent /></Suspense>
}

function SignInContent() {
  const [isLoading, setIsLoading] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbacks = searchParams.getAll('callbackUrl')
  const callbackUrl = safeCallbackUrl(callbacks.length === 1 ? callbacks[0] : undefined)

  useEffect(() => {
    let active = true
    getProviders().then(providers => {
      if (active) setGoogleEnabled(Boolean(providers?.google))
    }).catch(() => { /* Credentials remain available when provider discovery fails. */ })
    return () => { active = false }
  }, [])

  const handleCredentialsSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setError(null)
    setIsLoading(true)

    const form = e.currentTarget
    const formData = new FormData(form)
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    try {
      const result = await signIn("credentials", {
        email,
        password,
        twoFactorCode: String(formData.get("twoFactorCode") || "").trim(),
        redirect: false,
      })

      if (result?.error || result?.ok !== true) {
        setError('We couldn’t sign you in. Check your Ganges Healers email, password, and authenticator code if enabled.')
        toast.error("Invalid credentials")
      } else {
        toast.success("Signed in successfully")
        router.push(callbackUrl)
      }
    } catch {
      setError('Sign-in is temporarily unavailable. Please try again.')
      toast.error("Something went wrong")
    } finally {
      // Keep the email for retry, but do not leave password or one-use codes in the page.
      for (const name of ['password', 'twoFactorCode']) {
        const field = form.elements.namedItem(name)
        if (field instanceof HTMLInputElement) field.value = ''
      }
      submitting.current = false
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    if (!googleEnabled || submitting.current) return
    submitting.current = true
    setError(null)
    setIsLoading(true)
    try {
      await signIn("google", { callbackUrl })
    } catch {
      setError('Google sign-in is temporarily unavailable. Please try again.')
      toast.error("Something went wrong")
    } finally {
      submitting.current = false
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-md">
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Welcome to Ganges Healers</CardTitle>
          <CardDescription>Use the email and password you registered with Ganges Healers.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="credentials" className="w-full">
            {googleEnabled && <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="credentials">Email</TabsTrigger>
              <TabsTrigger value="oauth">Google</TabsTrigger>
            </TabsList>}

            <TabsContent value="credentials">
              <form aria-label="Sign in" aria-busy={isLoading} onSubmit={handleCredentialsSignIn} className="space-y-4">
                {error && <p id="sign-in-error" role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    aria-describedby={error ? 'sign-in-error' : undefined}
                    placeholder="you@example.com"
                    required
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    aria-describedby={error ? 'sign-in-error' : undefined}
                    placeholder="Enter your password"
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2"><Label htmlFor="twoFactorCode">Authenticator or recovery code (if enabled)</Label><Input id="twoFactorCode" name="twoFactorCode" autoComplete="one-time-code" maxLength={128} disabled={isLoading} /><p className="text-xs text-muted-foreground">Use a fresh code from your authenticator, or one saved recovery code.</p></div>
                <Link href={authPathWithCallback('/auth/reset-password', callbackUrl)} className="block text-sm underline">Forgot your password?</Link>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            {googleEnabled && <TabsContent value="oauth">
              {error && <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
              <Button onClick={handleGoogleSignIn} variant="outline" className="w-full" disabled={isLoading}>
                Continue with Google
              </Button>
              <p className="text-sm text-muted-foreground text-center mt-4">
                Sign in with your Google account
              </p>
            </TabsContent>}
          </Tabs>
          
          <div className="text-center mt-6">
            <p className="text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link 
                href={authPathWithCallback('/register', callbackUrl)}
                className="font-medium text-primary hover:underline"
              >
                Create one
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
