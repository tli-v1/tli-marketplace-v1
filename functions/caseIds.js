// Data Connect serializes UUIDs without separators; accept either representation
// and use one canonical key for notification events and delivery deduplication.
export const normalizeCaseId = (value) => {
  if (typeof value !== 'string') return ''
  const id = value.trim().toLowerCase()
  const compact = /^[0-9a-f]{32}$/.test(id)
    ? id
    : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
      ? id.replaceAll('-', '')
      : ''
  if (!/^[0-9a-f]{12}[1-5][0-9a-f]{3}[89ab][0-9a-f]{15}$/.test(compact)) return ''
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`
}
