import type {
  CreatorOwnerPlacementViewDTO,
  CreatorOwnerSeriesRecordDTO,
  CreatorOwnerSnapshotDTO,
} from '../types/creators';
import { joinCreatorOwnerPlacements } from './creator-owner-data';

export interface CreatorOwnerSeriesViewDTO extends CreatorOwnerSeriesRecordDTO {
  id: string;
}

export interface CreatorOwnerNavigationLists {
  links: CreatorOwnerPlacementViewDTO[];
  series: CreatorOwnerSeriesViewDTO[];
}

/** Build ephemeral table/query rows from the canonical owner snapshot. */
export function creatorOwnerNavigationLists(snapshot: CreatorOwnerSnapshotDTO): CreatorOwnerNavigationLists {
  return {
    links: joinCreatorOwnerPlacements(snapshot),
    series: Object.entries(snapshot.series).map(([id, series]) => ({ id, ...series })),
  };
}
