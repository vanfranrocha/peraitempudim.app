import type { Coordinates } from './delivery'

export type AddressSuggestion = {
  id: string
  label: string
  description: string
  provider: 'local'
}

export type AddressDetails = {
  id: string
  label: string
  street: string
  neighborhood: string
  city: string
  state: string
  postalCode: string
  coordinates: Coordinates
  provider: 'local'
}

const localAddresses: AddressDetails[] = [
  {
    id: 'av-goias-central',
    label: 'Avenida Goiás, Setor Central, Goiânia - GO',
    street: 'Avenida Goiás',
    neighborhood: 'Setor Central',
    city: 'Goiânia',
    state: 'GO',
    postalCode: '',
    coordinates: { lat: -16.67862, lng: -49.25328 },
    provider: 'local',
  },
  {
    id: 'av-t9-bueno',
    label: 'Avenida T-9, Setor Bueno, Goiânia - GO',
    street: 'Avenida T-9',
    neighborhood: 'Setor Bueno',
    city: 'Goiânia',
    state: 'GO',
    postalCode: '',
    coordinates: { lat: -16.70162, lng: -49.27392 },
    provider: 'local',
  },
  {
    id: 'av-t63-jardim-america',
    label: 'Avenida T-63, Jardim América, Goiânia - GO',
    street: 'Avenida T-63',
    neighborhood: 'Jardim América',
    city: 'Goiânia',
    state: 'GO',
    postalCode: '',
    coordinates: { lat: -16.71475, lng: -49.28912 },
    provider: 'local',
  },
  {
    id: 'rua-c137-jardim-america',
    label: 'Rua C-137, Jardim América, Goiânia - GO',
    street: 'Rua C-137',
    neighborhood: 'Jardim América',
    city: 'Goiânia',
    state: 'GO',
    postalCode: '',
    coordinates: { lat: -16.71475, lng: -49.28912 },
    provider: 'local',
  },
  {
    id: 'av-independencia-faicalville',
    label: 'Avenida Independência, Setor Faiçalville, Goiânia - GO',
    street: 'Avenida Independência',
    neighborhood: 'Setor Faiçalville',
    city: 'Goiânia',
    state: 'GO',
    postalCode: '74350-823',
    coordinates: { lat: -16.74062, lng: -49.30683 },
    provider: 'local',
  },
  {
    id: 'av-rio-verde',
    label: 'Avenida Rio Verde, Goiânia - GO',
    street: 'Avenida Rio Verde',
    neighborhood: 'Vila Rosa',
    city: 'Goiânia',
    state: 'GO',
    postalCode: '',
    coordinates: { lat: -16.735, lng: -49.292 },
    provider: 'local',
  },
  {
    id: 'parque-amazonia',
    label: 'Parque Amazônia, Goiânia - GO',
    street: '',
    neighborhood: 'Parque Amazônia',
    city: 'Goiânia',
    state: 'GO',
    postalCode: '',
    coordinates: { lat: -16.73036, lng: -49.27894 },
    provider: 'local',
  },
  {
    id: 'setor-marista',
    label: 'Setor Marista, Goiânia - GO',
    street: '',
    neighborhood: 'Setor Marista',
    city: 'Goiânia',
    state: 'GO',
    postalCode: '',
    coordinates: { lat: -16.69948, lng: -49.25978 },
    provider: 'local',
  },
]

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

export async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  const normalizedQuery = normalizeText(query.replace(/\s+/g, ' ').trim().slice(0, 120))
  if (normalizedQuery.length < 3) return []

  return localAddresses
    .filter((item) => normalizeText(item.label).includes(normalizedQuery))
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      label: item.label,
      description: [item.neighborhood, `${item.city} - ${item.state}`].filter(Boolean).join(' • '),
      provider: 'local',
    }))
}

export async function getAddressDetails(placeId: string): Promise<AddressDetails> {
  const found = localAddresses.find((item) => item.id === placeId)
  if (!found) throw new Error('address-details-not-found')
  return found
}
