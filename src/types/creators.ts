export type CreatorProgram = 'User Group Leaders' | 'Community Builders' | 'Heroes';

export type CreatorSocial = 'instagram' | 'x' | 'linkedin' | 'awsBuilder' | 'website';

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
  directoryApproval: string;
  resourceVersion: number;
  placementVersion?: number;
}

export interface CreatorEditableResourceDTO {
  id: string;
  title: string;
  url: string;
  description?: string;
  version: number;
}

export interface CreatorClaimDTO {
  id: string;
  resourceIds: string[];
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
}
