export function parseRange(fromStr: string|null, toStr: string|null) {
  const now = new Date()
  // Default last 30 days inclusive
  const end = toStr ? new Date(toStr + 'T23:59:59.999Z') : now
  const start = fromStr ? new Date(fromStr + 'T00:00:00.000Z') : new Date(end.getTime() - 29*24*60*60*1000)
  return { from: start, to: end }
}