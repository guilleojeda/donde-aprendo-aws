import type { CREATOR_SOCIALS } from '../lib/creator-values.mjs';

export type CreatorProgram = 'User Group Leaders' | 'Community Builders' | 'Heroes';

export type CreatorSocial = typeof CREATOR_SOCIALS[number];

export type CreatorVersionEntity = 'profile' | 'resource';

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

export type CreatorPublicLinkKind = 'content' | 'source' | 'community' | 'event' | 'unclassified';

export interface CreatorPublicLinkDTO {
  placementId: string;
  title: string;
  url: string;
  kind: CreatorPublicLinkKind;
  format?: string;
  topics: string[];
  description?: string;
  featured: boolean;
  series: CreatorPublicSeriesTagDTO[];
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
  /** Persisted claim row version; optional for snapshots from legacy deployments. */
  version?: number;
  resources?: CreatorClaimResourceDTO[];
  sourceId?: string;
  status?: string;
  createdAt?: number;
  evidence?: string;
}

export type CreatorResourceClassificationState = 'explicit' | 'legacy' | 'absent' | 'invalid' | 'event';

export interface CreatorResourceClassificationValues {
  kind: Exclude<CreatorCatalogResourceType, 'event'>;
  format: string;
  topics: string[];
}

export type CreatorResourceClassification =
  | ({ state: 'explicit' | 'legacy' } & CreatorResourceClassificationValues)
  | { state: 'absent' | 'invalid' | 'event' };

/** The private v2 owner read. Aggregate revisions live at the snapshot root. */
export interface CreatorOwnerProfileDTO extends Omit<CreatorProfileDTO, 'version'> {}

export interface CreatorOwnerResourceBaseDTO {
  id: string;
  version: number;
  title: string;
  url: string;
  description?: string;
  hidden: boolean;
  directoryApproval: string;
  metadataEditable: boolean;
  /** The owner's retained reference, with edit authority and no placement on the page. */
  reincludeAllowed: boolean;
}

export interface CreatorOwnerResourceV2DTO extends CreatorOwnerResourceBaseDTO {}

export interface CreatorOwnerResourceV3DTO extends CreatorOwnerResourceBaseDTO {
  classification: CreatorResourceClassification;
  classificationEditable: boolean;
}

/** Current owner island/server state. Legacy v2 is parsed separately and never installed here. */
export type CreatorOwnerResourceDTO = CreatorOwnerResourceV3DTO;

export interface CreatorOwnerPlacementDTO {
  resourceId: string;
  selectedForDirectory: boolean;
}

export interface CreatorOwnerOrderDTO {
  featured: string[];
  ordinary: string[];
}

export interface CreatorOwnerSeriesRecordDTO {
  name: string;
  slug: string;
  description?: string;
  chapters: string[];
}

export interface CreatorOwnerSnapshotV2DTO {
  schemaVersion: 2;
  creatorVersion: number | null;
  profile: CreatorOwnerProfileDTO | null;
  resources: CreatorOwnerResourceV2DTO[];
  placements: Record<string, CreatorOwnerPlacementDTO>;
  order: CreatorOwnerOrderDTO;
  series: Record<string, CreatorOwnerSeriesRecordDTO>;
  claims: CreatorClaimDTO[];
}

export interface CreatorOwnerSnapshotV3DTO {
  schemaVersion: 3;
  creatorVersion: number | null;
  profile: CreatorOwnerProfileDTO | null;
  resources: CreatorOwnerResourceV3DTO[];
  placements: Record<string, CreatorOwnerPlacementDTO>;
  order: CreatorOwnerOrderDTO;
  series: Record<string, CreatorOwnerSeriesRecordDTO>;
  claims: CreatorClaimDTO[];
}

/** Current owner island/server state. */
export type CreatorOwnerSnapshotDTO = CreatorOwnerSnapshotV3DTO;
export type CreatorOwnerSnapshotWireDTO = CreatorOwnerSnapshotV2DTO | CreatorOwnerSnapshotV3DTO;

/** Display-only join of the canonical resource, placement and sequence facts. */
export interface CreatorOwnerPlacementViewDTO {
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
  metadataEditable: boolean;
  series: CreatorSeriesMembershipDTO[];
}
