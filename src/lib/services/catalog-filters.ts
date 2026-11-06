type SearchValue = string | string[] | null | undefined

export function parseCatalogPrice(value: SearchValue): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return
  const price = Number(value)
  if (Number.isFinite(price) && price >= 0) return price
}

export function parseMinimumServiceRating(value: SearchValue): number | undefined {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.trim())) return
  const rating = Number(value)
  if (rating >= 1 && rating <= 5 && Math.round(rating * 10) / 10 === rating) return rating
}
