"use client"

import { Button } from "@/components/ui/button"
import { useCart } from "@/components/store/CartProvider"
import { toast } from "sonner"
import { ShoppingCart } from "lucide-react"
import { trackAddToCart } from "@/lib/analytics/meta-pixel"
import { trackClientEvent } from "@/lib/analytics/track-client-event"

interface Props {
  productId: string
  slug: string
  title: string
  pricePaise: number
  imageUrl: string | null
  stockStatus: string
}

export default function AddToCartButton({ productId, slug, title, pricePaise, imageUrl, stockStatus }: Props) {
  const { addItem, setIsOpen } = useCart()

  if (stockStatus === "OUT") {
    return (
      <Button disabled variant="outline" className="w-full mt-4">
        Out of stock
      </Button>
    )
  }

  const handleAdd = () => {
    addItem({ productId, slug, title, pricePaise, imageUrl })
    trackAddToCart({
      content_name: title,
      content_ids: [productId],
      value: pricePaise / 100,
      currency: 'INR',
    })
    trackClientEvent('add_to_cart', {
      metadata: { productId, title, pricePaise },
    })
    toast.success(`${title} added to cart`)
    setIsOpen(true)
  }

  return (
    <Button onClick={handleAdd} className="w-full mt-4 gap-2">
      <ShoppingCart className="w-4 h-4" />
      Add to Cart
    </Button>
  )
}
