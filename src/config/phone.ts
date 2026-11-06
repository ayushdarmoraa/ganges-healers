/** Explicit international syntax only; carrier/country deliverability is checked by the SMS provider. */
export function isInternationalPhone(phone: string | null | undefined): phone is string {
  return typeof phone === 'string' && /^\+[1-9]\d{7,14}$/.test(phone)
}
