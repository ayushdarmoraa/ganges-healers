"use client"

import { SessionProvider } from "next-auth/react"
import { CartProvider } from "@/components/store/CartProvider"
import { NotificationProvider } from '@/components/notifications/NotificationProvider'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <NotificationProvider><CartProvider>{children}</CartProvider></NotificationProvider>
    </SessionProvider>
  )
}
