import type { Coordinates } from './delivery'

export type AddressSuggestion = {
  id: string
  label: string
  description: string
  provider: 'geoapify'
}

export type AddressDetails = {
  id: string
  label: string
  street: string
  houseNumber: string
  neighborhood: string
  district: string
  city: string
  state: string
  stateCode: string
  postalCode: string
  coordinates: Coordinates
  provider: 'geoapify'
}

type GeoapifyFeature = {
  properties?: {
    place_id?: string
    formatted?: string
    name?: string
    street?: string
    housenumber?: string
    postcode?: string
    suburb?: string
    district?: string
    city?: string
    county?: string
    state?: string
    state_code?: string
    country_code?: string
    lat?: number
    lon?: number
  }
  geometry?: {
    coordinates?: [number, number]
  }
}

type GeoapifyResponse = {
  features?: GeoapifyFeature[]
  message?: string
  error?: string
}

const geoapifyApiKey = import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined
const geoapifyEndpoint = 'https://api.geoapify.com/v1/geocode/autocomplete'
const goianiaBias = { lat: -16.6869, lon: -49.2648 }
const queryCache = new Map<string, AddressSuggestion[]>()
const detailsCache = new Map<string, AddressDetails>()

export class AddressAutocompleteError extends Error {
  constructor(
    public code: 'missing-key' | 'invalid-key' | 'rate-limit' | 'network' | 'request-failed',
    message: string,
  ) {
    super(message)
    this.name = 'AddressAutocompleteError'
  }
}

function compactSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeQuery(value: string) {
  return compactSpaces(value).slice(0, 120)
}

function pickStreet(properties: NonNullable<GeoapifyFeature['properties']>) {
  return compactSpaces(properties.street || properties.name || properties.formatted?.split(',')[0] || '')
}

function pickNeighborhood(properties: NonNullable<GeoapifyFeature['properties']>) {
  return compactSpaces(properties.suburb || properties.district || properties.county || '')
}

function getCoordinates(feature: GeoapifyFeature) {
  const properties = feature.properties ?? {}
  const [lon, lat] = feature.geometry?.coordinates ?? []

  return {
    lat: typeof properties.lat === 'number' ? properties.lat : lat,
    lng: typeof properties.lon === 'number' ? properties.lon : lon,
  }
}

function mapFeatureToAddress(feature: GeoapifyFeature, index: number): AddressDetails | null {
  const properties = feature.properties ?? {}
  if (properties.country_code && properties.country_code.toLowerCase() !== 'br') return null

  const coordinates = getCoordinates(feature)
  if (typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') return null
  const validCoordinates: Coordinates = { lat: coordinates.lat, lng: coordinates.lng }

  const street = pickStreet(properties)
  const neighborhood = pickNeighborhood(properties)
  const city = compactSpaces(properties.city || 'Goiânia')
  const stateCode = compactSpaces(properties.state_code || 'GO')
  const state = stateCode || compactSpaces(properties.state || 'GO')
  const houseNumber = compactSpaces(properties.housenumber || '')
  const district = compactSpaces(properties.district || '')
  const postalCode = compactSpaces(properties.postcode || '')
  const primaryLabel = [street, houseNumber].filter(Boolean).join(', ') || neighborhood || properties.formatted || 'Endereço'
  const label = compactSpaces(primaryLabel)
  const id = properties.place_id || `${label}-${coordinates.lat.toFixed(6)}-${coordinates.lng.toFixed(6)}-${index}`

  return {
    id,
    label,
    street,
    houseNumber,
    neighborhood,
    district,
    city,
    state,
    stateCode,
    postalCode,
    coordinates: validCoordinates,
    provider: 'geoapify',
  }
}

function toSuggestion(details: AddressDetails): AddressSuggestion {
  return {
    id: details.id,
    label: details.label,
    description: [details.neighborhood || details.district, `${details.city} - ${details.stateCode || details.state}`]
      .filter(Boolean)
      .join(' • '),
    provider: 'geoapify',
  }
}

export async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  const normalizedQuery = normalizeQuery(query)
  if (normalizedQuery.length < 3) return []
  if (!geoapifyApiKey) {
    console.warn('[Geoapify] API key missing')
    throw new AddressAutocompleteError('missing-key', 'Geoapify API key missing')
  }

  const cacheKey = normalizedQuery.toLocaleLowerCase('pt-BR')
  const cached = queryCache.get(cacheKey)
  if (cached) return cached

  const params = new URLSearchParams({
    text: normalizedQuery,
    apiKey: geoapifyApiKey,
    filter: 'countrycode:br',
    bias: `proximity:${goianiaBias.lon},${goianiaBias.lat}`,
    limit: '8',
    lang: 'pt',
  })

  let response: Response
  try {
    response = await fetch(`${geoapifyEndpoint}?${params.toString()}`)
  } catch (error) {
    console.warn('[Geoapify] Network error', error instanceof Error ? error.message : String(error))
    throw new AddressAutocompleteError('network', 'Geoapify network error')
  }

  let data: GeoapifyResponse = {}
  try {
    data = await response.json() as GeoapifyResponse
  } catch {
    data = {}
  }

  if (!response.ok) {
    const apiMessage = data.message || data.error || ''
    console.warn('[Geoapify] Request failed', {
      status: response.status,
      statusText: response.statusText,
      message: apiMessage || null,
    })

    if (response.status === 401 || response.status === 403) {
      throw new AddressAutocompleteError('invalid-key', apiMessage || 'Geoapify API key invalid')
    }

    if (response.status === 429) {
      throw new AddressAutocompleteError('rate-limit', apiMessage || 'Geoapify rate limit exceeded')
    }

    throw new AddressAutocompleteError('request-failed', apiMessage || 'Geoapify request failed')
  }

  const suggestions = (data.features ?? [])
    .map(mapFeatureToAddress)
    .filter((item): item is AddressDetails => Boolean(item))
    .map((item) => {
      detailsCache.set(item.id, item)
      return toSuggestion(item)
    })

  queryCache.set(cacheKey, suggestions)
  return suggestions
}

export async function getAddressDetails(placeId: string): Promise<AddressDetails> {
  const found = detailsCache.get(placeId)
  if (!found) throw new Error('address-details-not-found')
  return found
}
