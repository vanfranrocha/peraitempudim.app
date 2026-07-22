export type Coordinates = {
  lat: number
  lng: number
}

export type CepAddress = {
  cep: string
  street: string
  neighborhood: string
  city: string
  state: string
}

export type DeliveryDistanceResult = {
  distanceKm: number
  origin: Coordinates
  destination: Coordinates
  provider: 'haversine'
}

export const deliveryOriginCep = '74350-823'
export const deliveryOriginAddress = 'Avenida Independência, Setor Faiçalville, Goiânia - GO, CEP 74350-823'
export const deliveryOriginCoordinates: Coordinates = { lat: -16.74062, lng: -49.30683 }


const goianiaNeighborhoodCoordinates: Array<{ terms: string[]; coordinates: Coordinates }> = [
  { terms: ['setor central', 'centro'], coordinates: { lat: -16.67862, lng: -49.25328 } },
  { terms: ['setor bueno'], coordinates: { lat: -16.70162, lng: -49.27392 } },
  { terms: ['setor marista'], coordinates: { lat: -16.69948, lng: -49.25978 } },
  { terms: ['setor oeste'], coordinates: { lat: -16.68363, lng: -49.27174 } },
  { terms: ['setor sul'], coordinates: { lat: -16.6864, lng: -49.2475 } },
  { terms: ['jardim america', 'jardim américa'], coordinates: { lat: -16.71475, lng: -49.28912 } },
  { terms: ['parque amazonia', 'parque amazônia'], coordinates: { lat: -16.73036, lng: -49.27894 } },
  { terms: ['faiçalville', 'faicalville'], coordinates: deliveryOriginCoordinates },
  { terms: ['setor faiçalville', 'setor faicalville'], coordinates: deliveryOriginCoordinates },
  { terms: ['setor pedro ludovico'], coordinates: { lat: -16.71806, lng: -49.25625 } },
  { terms: ['jardim goias', 'jardim goiás'], coordinates: { lat: -16.69968, lng: -49.23504 } },
  { terms: ['vila redencao', 'vila redenção'], coordinates: { lat: -16.71492, lng: -49.24475 } },
  { terms: ['setor universitario', 'setor universitário'], coordinates: { lat: -16.67592, lng: -49.23898 } },
]

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

function estimateGoianiaCoordinates(address: string) {
  const normalized = normalizeText(address)
  if (!normalized.includes('goiania')) return null

  const match = goianiaNeighborhoodCoordinates.find((item) =>
    item.terms.some((term) => normalized.includes(normalizeText(term))),
  )

  return match?.coordinates ?? null
}

export const deliveryRanges = [
  { maxDistance: 3, price: 6 },
  { maxDistance: 6, price: 8 },
  { maxDistance: 9, price: 11 },
  { maxDistance: 12, price: 15 },
] as const

export function getDeliveryFee(distanceKm: number) {
  const range = deliveryRanges.find((item) => distanceKm <= item.maxDistance)
  return range?.price ?? null
}

export function normalizeCep(value: string) {
  return value.replace(/\D/g, '').slice(0, 8)
}

export function formatCep(value: string) {
  const digits = normalizeCep(value)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

export async function lookupCep(cep: string): Promise<CepAddress> {
  const digits = normalizeCep(cep)
  if (digits.length !== 8) throw new Error('invalid-cep')

  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
  if (!response.ok) throw new Error('cep-request-failed')

  const data = await response.json()
  if (data.erro) throw new Error('cep-not-found')

  return {
    cep: data.cep || formatCep(digits),
    street: data.logradouro || '',
    neighborhood: data.bairro || '',
    city: data.localidade || '',
    state: data.uf || '',
  }
}

export async function geocodeAddress(address: string): Promise<Coordinates> {
  const query = address.trim()
  if (!query) throw new Error('invalid-address')

  const candidates = Array.from(new Set([
    query,
    query.replace(/,?\s*CEP\s*\d{5}-?\d{3}/i, ''),
    query.replace(/,?\s*CEP\s*\d{5}-?\d{3}/i, '').replace(/,\s*[^,]*(apartamento|apto|bloco|lote|quadra|casa)[^,]*/i, ''),
  ].map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean)))

  for (const candidate of candidates) {
    const params = new URLSearchParams({
      format: 'json',
      limit: '1',
      countrycodes: 'br',
      q: candidate,
    })

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`)
    if (!response.ok) continue

    const data = await response.json()
    const first = Array.isArray(data) ? data[0] : null
    if (first?.lat && first?.lon) {
      return {
        lat: Number(first.lat),
        lng: Number(first.lon),
      }
    }
  }

  const fallback = estimateGoianiaCoordinates(query)
  if (fallback) return fallback

  throw new Error('address-not-found')
}

export function haversineDistanceKm(origin: Coordinates, destination: Coordinates) {
  const earthRadiusKm = 6371
  const toRadians = (value: number) => (value * Math.PI) / 180
  const latDistance = toRadians(destination.lat - origin.lat)
  const lngDistance = toRadians(destination.lng - origin.lng)
  const originLat = toRadians(origin.lat)
  const destinationLat = toRadians(destination.lat)

  const a =
    Math.sin(latDistance / 2) ** 2 +
    Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(lngDistance / 2) ** 2

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function getDeliveryDistance(originAddress: string, destinationAddress: string): Promise<DeliveryDistanceResult> {
  const origin = originAddress === deliveryOriginAddress ? deliveryOriginCoordinates : await geocodeAddress(originAddress)
  const destination = await geocodeAddress(destinationAddress)

  return {
    distanceKm: haversineDistanceKm(origin, destination),
    origin,
    destination,
    provider: 'haversine',
  }
}
