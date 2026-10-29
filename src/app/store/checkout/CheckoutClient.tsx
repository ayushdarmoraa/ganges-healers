"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCart, type CartItem } from "@/components/store/CartProvider"
import { openRazorpayCheckout } from "@/lib/payments/openRazorpayCheckout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { toast } from "sonner"
import { Trash2, CheckCircle } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { trackInitiateCheckout, trackPurchase } from "@/lib/analytics/meta-pixel"
import { readVariantClient } from "@/lib/experiments/client"
import { trackClientEvent } from "@/lib/analytics/track-client-event"

interface DynamicBundleData {
  bundle: {
    slug: string
    title: string
    pricePaise: number
    chakra: string | null
    items: Array<{ product: { slug: string; title: string; pricePaise: number } }>
  } | null
  discountPct: number
  reason: string | null
}

function getQuizContext(): { chakra?: string; intention?: string } {
  try {
    const raw = localStorage.getItem('ganges-quiz')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return { chakra: parsed.chakra, intention: parsed.intention }
  } catch {
    return {}
  }
}

export default function StoreCheckoutPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const { items, removeItem, updateQuantity, totalPaise, clearCart } = useCart()
  const searchParams = useSearchParams()
  const source = searchParams.get('source') || undefined
  const quizContext = useMemo(() => typeof window !== 'undefined' ? getQuizContext() : {}, [])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const verifyingRef = useRef(false)
  const [upsellBundle, setUpsellBundle] = useState<DynamicBundleData | null>(null)

  const [address, setAddress] = useState({
    name: session?.user?.name || "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    phone: "",
  })

  // Track cart activity for abandoned cart recovery
  const trackedRef = useRef(false)
  useEffect(() => {
    if (items.length > 0 && session?.user?.id && !trackedRef.current) {
      trackedRef.current = true
      fetch('/api/store/cart-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, source, ...quizContext }),
      }).catch(() => {})
    }
  }, [items, session?.user?.id, source, quizContext])

  // Fetch smart bundle upsell
  useEffect(() => {
    if (items.length === 0) return
    const chakra = quizContext.chakra
    fetch(`/api/store/dynamic-bundle${chakra ? `?chakra=${encodeURIComponent(chakra)}` : ''}`)
      .then((r) => r.json())
      .then((data) => { if (data.bundle) setUpsellBundle(data) })
      .catch(() => {})
  }, [items.length, quizContext.chakra])

  const handleField = (field: string, value: string) => {
    setAddress((prev) => ({ ...prev, [field]: value }))
  }

  const isAddressValid =
    address.name.trim() &&
    address.line1.trim() &&
    address.city.trim() &&
    address.state.trim() &&
    address.postalCode.trim()

  const handleCheckout = async () => {
    if (!session?.user?.id) {
      router.push("/auth/signin")
      return
    }

    if (!isAddressValid) {
      setError("Please fill in all required address fields.")
      return
    }

    setLoading(true)
    setError("")

    trackInitiateCheckout({
      content_ids: items.map((i) => i.productId),
      num_items: items.reduce((sum, i) => sum + i.quantity, 0),
      value: totalPaise / 100,
      currency: 'INR',
    })

    try {
      // Step 1: Create order + Razorpay order
      const checkoutRes = await fetch("/api/store/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          source,
          chakra: quizContext.chakra,
          intention: quizContext.intention,
          experimentVariant: readVariantClient('product_headline') ?? undefined,
          shippingAddress: {
            name: address.name.trim(),
            line1: address.line1.trim(),
            line2: address.line2.trim() || undefined,
            city: address.city.trim(),
            state: address.state.trim(),
            postalCode: address.postalCode.trim(),
            phone: address.phone.trim() || undefined,
          },
        }),
      })

      if (!checkoutRes.ok) {
        const errData = await checkoutRes.json().catch(() => ({}))
        throw new Error(errData.error || "Checkout failed")
      }

      const { razorpayOrderId, amountPaise, key } = await checkoutRes.json()

      // Step 2: Open Razorpay checkout
      const result = await openRazorpayCheckout({
        orderId: razorpayOrderId,
        amountPaise,
        key,
        prefill: { email: session.user.email || "", name: session.user.name || "" },
        description: `Store order — ${items.length} item(s)`,
      })

      // Step 3: Verify payment
      if (verifyingRef.current) return
      verifyingRef.current = true

      const verifyRes = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: result.razorpay_order_id,
          paymentId: result.razorpay_payment_id,
          signature: result.razorpay_signature,
        }),
      })

      if (!verifyRes.ok) {
        const vErr = await verifyRes.json().catch(() => ({}))
        throw new Error(vErr.error || "Payment verification failed")
      }

      trackPurchase({
        content_ids: items.map((i) => i.productId),
        content_type: 'product',
        num_items: items.reduce((sum, i) => sum + i.quantity, 0),
        value: totalPaise / 100,
        currency: 'INR',
      })

      // purchase event is tracked server-side in /api/payments/verify
      setSuccess(true)
      clearCart()
      // Mark abandoned cart as recovered
      fetch('/api/store/cart-activity', { method: 'DELETE' }).catch(() => {})
      toast.success("Order placed successfully! Redirecting…")
      setTimeout(() => router.push("/dashboard/orders"), 1500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      if (msg === "Payment dismissed") {
        setError("Payment was cancelled. You can try again.")
      } else {
        setError(msg)
      }
      toast.error(msg === "Payment dismissed" ? "Payment cancelled" : msg)
    } finally {
      setLoading(false)
      verifyingRef.current = false
    }
  }

  if (success) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Card className="p-6 border-green-300 bg-green-50">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <div>
              <div className="text-lg font-medium text-green-800">Order placed!</div>
              <div className="text-sm text-green-700">Redirecting to your orders…</div>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="container mx-auto p-6 max-w-2xl text-center">
        <h1 className="text-2xl font-semibold">Checkout</h1>
        <p className="mt-4 text-muted-foreground">Your cart is empty.</p>
        <Button asChild className="mt-4">
          <Link href="/store">Continue Shopping</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Checkout</h1>

      {/* Cart items */}
      <Card className="mt-6 p-4">
        <h2 className="font-medium mb-3">Order Summary ({items.length} item{items.length > 1 ? "s" : ""})</h2>
        <div className="space-y-3">
          {items.map((item: CartItem) => (
            <div key={item.productId} className="flex items-center gap-3">
              {item.imageUrl ? (
                <Image src={item.imageUrl} alt={item.title} width={48} height={48} className="w-12 h-12 object-cover rounded" />
              ) : (
                <div className="w-12 h-12 bg-muted rounded" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.title}</div>
                <div className="text-xs text-muted-foreground">
                  ₹{(item.pricePaise / 100).toFixed(2)} × {item.quantity}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={item.quantity}
                  onChange={(e) => updateQuantity(item.productId, Number(e.target.value))}
                  className="border rounded px-2 py-1 text-sm"
                  aria-label={`Quantity for ${item.title}`}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span className="text-sm font-medium w-20 text-right">
                  ₹{((item.pricePaise * item.quantity) / 100).toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(item.productId)}
                  className="p-1 hover:bg-muted rounded text-destructive"
                  aria-label={`Remove ${item.title}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-4 pt-3 border-t font-medium">
          <span>Total</span>
          <span>₹{(totalPaise / 100).toFixed(2)}</span>
        </div>
      </Card>

      {/* Shipping address */}
      <Card className="mt-6 p-4">
        <h2 className="font-medium mb-3">Shipping Address</h2>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="name">Full Name *</Label>
            <Input id="name" value={address.name} onChange={(e) => handleField("name", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="line1">Address Line 1 *</Label>
            <Input id="line1" value={address.line1} onChange={(e) => handleField("line1", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="line2">Address Line 2</Label>
            <Input id="line2" value={address.line2} onChange={(e) => handleField("line2", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="city">City *</Label>
              <Input id="city" value={address.city} onChange={(e) => handleField("city", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="state">State *</Label>
              <Input id="state" value={address.state} onChange={(e) => handleField("state", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="postalCode">Postal Code *</Label>
              <Input id="postalCode" value={address.postalCode} onChange={(e) => handleField("postalCode", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={address.phone} onChange={(e) => handleField("phone", e.target.value)} />
            </div>
          </div>
        </div>
      </Card>

      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}

      {/* Last-chance bundle upsell */}
      {upsellBundle?.bundle && (
        <Card className="mt-6 p-4 border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
          <div className="flex items-center gap-2 mb-2">
            <span>🎯</span>
            <h3 className="font-semibold">
              {upsellBundle.reason === 'high_engagement_score' ? 'Curated for You' : 'Complete Your Practice'}
            </h3>
            {upsellBundle.discountPct > 0 && (
              <span className="ml-auto bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {upsellBundle.discountPct}% OFF
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-2">{upsellBundle.bundle.title}</p>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-amber-700 dark:text-amber-400">
              ₹{(Math.round(upsellBundle.bundle.pricePaise * (1 - upsellBundle.discountPct / 100)) / 100).toFixed(0)}
            </span>
            <Link
              href={`/store/bundles/${upsellBundle.bundle.slug}`}
              className="inline-flex items-center justify-center rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              View Bundle
            </Link>
          </div>
        </Card>
      )}

      <Button
        onClick={handleCheckout}
        disabled={loading || !isAddressValid}
        className="w-full mt-6"
        size="lg"
      >
        {loading ? "Processing…" : `Pay ₹${(totalPaise / 100).toFixed(2)}`}
      </Button>
    </div>
  )
}
