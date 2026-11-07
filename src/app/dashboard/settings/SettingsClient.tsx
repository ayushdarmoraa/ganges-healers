"use client"

import { useEffect, useRef, useState } from "react"
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
import PhoneVerificationSettings, { PROFILE_UPDATED_EVENT } from '@/components/auth/PhoneVerificationSettings'
import { isInternationalPhone } from '@/config/phone'
import { signOutCurrentSession } from '@/lib/auth/client-session'
import AccountClosureSettings from '@/components/auth/AccountClosureSettings'

// --- Schemas ---

const profileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  phone: z.string().max(16).refine(value => value === '' || value.length >= 10 || isInternationalPhone(value), 'Phone must be at least 10 characters').optional(),
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
    id: string
    profileVersion: string
    name: string
    email: string
    phone: string
    image: string
    passwordExists: boolean
  }
}

export default function SettingsClient({ user }: Props) {
  const { update: updateSession, data: session, status } = useSession()
  const router = useRouter()

  if (session?.user?.id !== user.id) return <div className="container mx-auto max-w-2xl space-y-4 p-6">
    <h1 className="text-2xl font-semibold">Account Settings</h1>
    {status === 'loading' ? <p role="status">Loading account settings…</p> : <>
      <p role="alert">Your account changed. Reload account settings to continue.</p>
      <Button type="button" onClick={() => router.refresh()}>Reload account settings</Button>
    </>}
  </div>

  return (
    <div className="container mx-auto p-6 max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold">Account Settings</h1>

      <ProfileSection key={`profile-${user.id}`} user={user} disabled={status !== 'authenticated'} onSessionRefresh={updateSession} />

      <PasswordSection key={`password-${user.id}`} passwordExists={user.passwordExists} />
      <EmailVerificationSettings userId={session?.user?.id ?? ""} sessionLoading={status === "loading"} />
      <PhoneVerificationSettings userId={session?.user?.id ?? ""} sessionLoading={status === "loading"} />
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
      <AccountClosureSettings userId={session?.user?.id ?? ''} authenticationAt={session?.user?.recentAuthentication?.issuedAt} sessionLoading={status === 'loading'} />
    </div>
  )
}

// --- Profile Section ---

function ProfileSection({
  user,
  disabled,
  onSessionRefresh,
}: {
  user: Props["user"]
  disabled: boolean
  onSessionRefresh: (data?: Record<string, unknown>) => Promise<unknown>
}) {
  const [saving, setSaving] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [version, setVersion] = useState(user.profileVersion)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(user.image)
  const busy = useRef(false)
  const active = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])

  const form = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, phone: user.phone },
  })

  const onSubmit = async (data: ProfileData) => {
    if (busy.current || disabled) return
    busy.current = true
    setSaving(true)
    setError(''); setMessage('')
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", 'X-Account-Id': user.id, 'If-Match': `"${version}"` },
        body: JSON.stringify({
          name: data.name,
          phone: data.phone || null,
        }),
      })

      const body: unknown = await res.json().catch(() => null)
      if (!active.current) return
      if (!res.ok) throw new Error(responseError(body, 'Update failed'))
      const saved = savedProfile(body, user.id)
      if (!saved || saved.user.name !== data.name || saved.user.phone !== (data.phone || null)) throw new Error('Profile save could not be confirmed. Your draft is still available; reload the saved profile before retrying.')
      setVersion(saved.profileVersion)
      form.reset({ name: saved.user.name || '', phone: saved.user.phone || '' })
      setMessage('Profile updated.')
      window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: { ownerId: user.id } }))
      toast.success("Profile updated")
      try { await onSessionRefresh() }
      catch { if (active.current) setMessage('Profile updated. Reload the page to refresh your account menu.') }
    } catch (err) {
      if (active.current) {
        const message = err instanceof Error ? err.message : 'Update failed'
        setError(message); toast.error(message)
      }
    } finally {
      busy.current = false
      if (active.current) setSaving(false)
    }
  }

  const reload = async () => {
    if (busy.current || disabled) return
    busy.current = true; setReloading(true); setError(''); setMessage('')
    try {
      const res = await fetch('/api/users/me', { cache: 'no-store' })
      const body: unknown = await res.json().catch(() => null)
      if (!active.current) return
      if (!res.ok) throw new Error(responseError(body, 'Unable to reload the saved profile. Your draft is still available.'))
      const saved = savedProfile(body, user.id)
      if (!saved) throw new Error('Unable to confirm the saved profile. Your draft is still available. Reload account settings if your account changed.')
      setVersion(saved.profileVersion)
      form.reset({ name: saved.user.name || '', phone: saved.user.phone || '' })
      setMessage('Saved profile loaded. Review it before saving.')
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'Unable to reload the saved profile.') }
    finally { busy.current = false; if (active.current) setReloading(false) }
  }

  const handleAvatarUploaded = async (url: string) => {
    if (!active.current) return
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
          <form aria-label="Edit profile" aria-busy={saving || reloading} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <fieldset disabled={disabled || saving || reloading} className="space-y-4">
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
                    <Input type="tel" autoComplete="tel" maxLength={16} placeholder="Phone number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit">
              {saving ? "Saving…" : "Save Changes"}
            </Button>
            <p className="text-xs text-muted-foreground">Reloading replaces your draft with the saved name and phone.</p>
            <Button type="button" variant="outline" onClick={() => void reload()}>{reloading ? 'Reloading…' : 'Discard draft and reload'}</Button>
            </fieldset>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {message && <p role="status" className="text-sm">{message}</p>}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

const savedProfileSchema = z.object({
  user: z.object({ id: z.string(), name: z.string().nullable(), phone: z.string().nullable() }),
  profileVersion: z.string().regex(/^[a-f0-9]{64}$/),
})
function savedProfile(body: unknown, ownerId: string) {
  const parsed = savedProfileSchema.safeParse(body)
  return parsed.success && parsed.data.user.id === ownerId ? parsed.data : null
}
function responseError(body: unknown, fallback: string) {
  return body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : fallback
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
