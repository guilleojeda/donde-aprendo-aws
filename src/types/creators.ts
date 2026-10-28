export type CreatorProgram = 'User Group Leaders' | 'Community Builders' | 'Heroes';

export type CreatorSocial = 'instagram' | 'x' | 'linkedin' | 'awsBuilder' | 'website';

export type CreatorVersionEntity = 'profile' | 'resource' | 'placement' | 'series';

export interface CreatorVersionChange {
  entity: CreatorVersionEntity;
  id: string;
  before: number;
  after: number;
}

export interface CreatorProfileDTO {
  id: string;
  displayName: string;
  slug: string;
  city?: string;
  country?: string;
  programs: CreatorProgram[];
  bio?: string;
  socials: Partial<Record<CreatorSocial, string>>;
  photo?: { version: number | string; url?: string };
  published: boolean;
  hidden: boolean;
  version: number;
}

export interface CreatorLinkDTO {
  placementId: string;
  resourceId: string;
  title: string;
  url: string;
  description?: string;
  featured: boolean;
  position: number;
  selectedForDirectory: boolean;
  hidden: boolean;
  directoryApproval: string;
  resourceVersion: number;
  placementVersion?: number;
  series: CreatorSeriesMembershipDTO[];
}

export interface CreatorSeriesMembershipDTO {
  seriesId: string;
  position: number;
}

export interface CreatorSeriesDTO {
  id: string;
  name: string;
  slug: string;
  description?: string;
  version: number;
}

export interface CreatorPublicSeriesSummaryDTO extends CreatorSeriesDTO {
  chapterCount: number;
  href: string;
}

export interface CreatorPublicSeriesTagDTO {
  seriesId: string;
  name: string;
  href: string;
  position: number;
}

export interface CreatorPublicLinkDTO {
  placementId: string;
  title: string;
  url: string;
  description?: string;
  featured: boolean;
  series: CreatorPublicSeriesTagDTO[];
}

export interface CreatorEditableResourceDTO {
  id: string;
  title: string;
  url: string;
  description?: string;
  version: number;
}

export type CreatorCatalogResourceType = 'content' | 'source' | 'community' | 'event';

export interface CreatorCatalogSelectionDTO {
  id: string;
  title: string;
  url: string;
  tipo: CreatorCatalogResourceType;
}

export interface CreatorClaimResourceDTO {
  resourceId: string;
  url: string;
}

export interface CreatorClaimDTO {
  id: string;
  resourceIds: string[];
  resources?: CreatorClaimResourceDTO[];
  sourceId?: string;
  status?: string;
  createdAt?: number;
  evidence?: string;
}

export interface CreatorEditorDTO {
  profile: CreatorProfileDTO | null;
  links: CreatorLinkDTO[];
  editableResources: CreatorEditableResourceDTO[];
  claims: CreatorClaimDTO[];
  series: CreatorSeriesDTO[];
}
