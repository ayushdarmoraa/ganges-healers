"use client"

import { signIn } from "next-auth/react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"

export default function SignInPage() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

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
        router.push("/dashboard")
      }
    } catch {
      toast.error("Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      await signIn("google", { callbackUrl: "/dashboard" })
    } catch {
      toast.error("Something went wrong")
    }
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-md">
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Welcome to Ganges Healers</CardTitle>
          <CardDescription>Sign in to access your healthcare dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="credentials" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="credentials">Email</TabsTrigger>
              <TabsTrigger value="oauth">Google</TabsTrigger>
            </TabsList>

            <TabsContent value="credentials">
              <form onSubmit={handleCredentialsSignIn} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="admin@ganges-healers.com"
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
                    placeholder="admin123"
                    required
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
              <p className="text-sm text-muted-foreground text-center mt-4">
                Demo credentials: admin@ganges-healers.com / admin123
              </p>
            </TabsContent>

            <TabsContent value="oauth">
              <Button onClick={handleGoogleSignIn} variant="outline" className="w-full">
                Continue with Google
              </Button>
              <p className="text-sm text-muted-foreground text-center mt-4">
                Sign in with your Google account
              </p>
            </TabsContent>
          </Tabs>
          
          <div className="text-center mt-6">
            <p className="text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link 
                href="/register" 
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