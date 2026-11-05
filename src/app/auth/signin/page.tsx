"use client"

import { getProviders, signIn } from "next-auth/react"
import { Suspense, useEffect, useState } from "react"
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
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        toast.error("Invalid credentials")
      } else {
        toast.success("Signed in successfully")
        router.push(callbackUrl)
      }
    } catch {
      toast.error("Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    if (!googleEnabled || isLoading) return
    setIsLoading(true)
    try {
      await signIn("google", { callbackUrl })
    } catch {
      toast.error("Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-md">
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Welcome to Ganges Healers</CardTitle>
          <CardDescription>Sign in to manage your healing journey</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="credentials" className="w-full">
            {googleEnabled && <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="credentials">Email</TabsTrigger>
              <TabsTrigger value="oauth">Google</TabsTrigger>
            </TabsList>}

            <TabsContent value="credentials">
              <form onSubmit={handleCredentialsSignIn} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
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
                    placeholder="Enter your password"
                    required
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            {googleEnabled && <TabsContent value="oauth">
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
