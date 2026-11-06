"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from 'next/navigation'
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import AvatarUpload from "@/components/dashboard/AvatarUpload"
import TwoFactorSettings from "@/components/auth/TwoFactorSettings"
import EmailVerificationSettings from "@/components/auth/EmailVerificationSettings"
import { signOutCurrentSession } from '@/lib/auth/client-session'

// --- Schemas ---

const profileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  phone: z.string().min(10, "Phone must be at least 10 characters").max(15).optional().or(z.literal("")),
})

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

type ProfileData = z.infer<typeof profileSchema>
type PasswordData = z.infer<typeof passwordSchema>

// --- Props ---

interface Props {
  user: {
    name: string
    email: string
    phone: string
    image: string
    passwordExists: boolean
  }
}

export default function SettingsClient({ user }: Props) {
  const { update: updateSession, data: session, status } = useSession()

  return (
    <div className="container mx-auto p-6 max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold">Account Settings</h1>

      <ProfileSection user={user} onSessionRefresh={updateSession} />

      <PasswordSection passwordExists={user.passwordExists} />
      <EmailVerificationSettings userId={session?.user?.id ?? ""} sessionLoading={status === "loading"} />
      <TwoFactorSettings userId={session?.user?.id ?? ""} sessionLoading={status === "loading"} />

      <Card>
        <CardHeader>
          <CardTitle>Account Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Email: </span>
            <span>{user.email}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Email cannot be changed. Contact support if needed.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// --- Profile Section ---

function ProfileSection({
  user,
  onSessionRefresh,
}: {
  user: Props["user"]
  onSessionRefresh: (data?: Record<string, unknown>) => Promise<unknown>
}) {
  const [saving, setSaving] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(user.image)

  const form = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, phone: user.phone },
  })

  const onSubmit = async (data: ProfileData) => {
    setSaving(true)
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          phone: data.phone || null,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Update failed")
      }

      toast.success("Profile updated")
      // Refresh the NextAuth session so navbar reflects new name immediately
      await onSessionRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed")
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUploaded = async (url: string) => {
    setAvatarUrl(url)
    // Refresh session so the navbar avatar updates immediately
    await onSessionRefresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your name, phone, and avatar</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <AvatarUpload
          currentImage={avatarUrl}
          name={user.name}
          onUploaded={handleAvatarUploaded}
        />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Phone number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

// --- Password Section ---

function PasswordSection({ passwordExists }: { passwordExists: boolean }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const form = useForm<PasswordData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  })

  if (!passwordExists) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You signed in with a social provider. Password management is not available.
          </p>
        </CardContent>
      </Card>
    )
  }

  const onSubmit = async (data: PasswordData) => {
    setSaving(true)
    try {
      const res = await fetch("/api/users/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Password change failed")
      }

      const result: unknown = await res.json().catch(() => null)
      if (!result || typeof result !== 'object' || !('success' in result) || result.success !== true) {
        throw new Error('Password change could not be confirmed. Please try again.')
      }
      toast.success("Password changed. Sign in again with your new password.")
      form.reset()
      await signOutCurrentSession('/auth/signin')
      router.push('/auth/signin')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Password change failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>Update your account password</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Enter current password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Enter new password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm New Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Confirm new password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={saving}>
              {saving ? "Changing…" : "Change Password"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
