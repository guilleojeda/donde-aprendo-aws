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
  level?: string;
  sourceId?: string;
  communityId?: string;
  eventId?: string;
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
  registrationUrl: string;
}
