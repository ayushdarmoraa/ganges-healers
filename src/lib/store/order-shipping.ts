import { z } from 'zod'

export const shippingAddressSchema = z.object({
  name: z.string(),
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  phone: z.string().optional(),
})

const shippingName = z.string().trim().min(1).max(100)
export const staffShippingAddressSchema = shippingAddressSchema.extend({
  name: shippingName,
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: shippingName,
  state: shippingName,
  postalCode: z.string().trim().min(1).max(20),
  phone: z.string().trim().max(32).optional(),
})

export const parcelFields = {
  carrier: z.string().trim().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]+$/u),
  trackingNumber: z.string().trim().max(100).regex(/^[A-Za-z0-9][A-Za-z0-9 -]*$/),
}

const trackingSchema = z.object({
  shipment: z.object({ ...parcelFields, shippedAt: z.iso.datetime() }).optional(),
  deliveredAt: z.iso.datetime().optional(),
})

/** Only expose validated shipment details for orders whose shipment was recorded. */
export function readOrderTracking(status: string, value: unknown) {
  if (status !== 'shipped' && status !== 'delivered' && status !== 'fulfilled') return null
  const tracking = trackingSchema.safeParse(value)
  return tracking.success && (tracking.data.shipment || tracking.data.deliveredAt) ? tracking.data : null
}
