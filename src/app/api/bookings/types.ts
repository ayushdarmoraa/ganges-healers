import { z } from 'zod'

export const CreateBookingBody = z.object({
  healerId: z.string().min(1),
  serviceId: z.string().min(1),
  scheduledAt: z.string().datetime(),
})
export type CreateBookingBody = z.infer<typeof CreateBookingBody>

export const RescheduleBody = z.object({
  scheduledAt: z.string().datetime(),
})
export type RescheduleBody = z.infer<typeof RescheduleBody>
