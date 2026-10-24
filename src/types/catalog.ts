export interface CatalogSeriesAssociation {
  seriesId: string;
  name: string;
  creatorName: string;
  href: string;
}

export interface CatalogResource {
  id: string;
  title: string;
  url: string;
  description: string;
  category: string;
  order: number;
  featured: boolean;
  kind: string;
  format: string;
  topics: string[];
  addedAt?: string;
  country?: string;
  city?: string;
  level?: string;
  sourceId?: string;
  communityId?: string;
  eventId?: string;
  series?: CatalogSeriesAssociation[];
  recordType?: undefined;
}

export interface CatalogEvent {
  recordType: 'event';
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  organizer: string;
  mode: 'online' | 'in-person' | 'hybrid';
  place?: string;
  city?: string;
  country?: string;
  venueCountry?: string;
  communityId?: string;
  registrationUrl: string;
  series?: CatalogSeriesAssociation[];
}
