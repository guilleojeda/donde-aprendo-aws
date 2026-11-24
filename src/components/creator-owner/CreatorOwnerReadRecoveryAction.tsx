import type { CreatorOwnerState } from '../../lib/creator-owner-state';

type RecoveryAttribute = 'data-owner-refresh-retry' | 'data-owner-check' | 'data-owner-compare' | 'data-owner-publish-check';

interface Props {
  state: CreatorOwnerState;
  dataAttribute: RecoveryAttribute;
  label: string;
  onRetryRead(): void;
}

export default function CreatorOwnerReadRecoveryAction({ state, dataAttribute, label, onRetryRead }: Props) {
  const obsolete = state.operation.status === 'refresh-failed' && state.operation.readContractObsolete === true;
  if (obsolete) {
    return <a class="button button--outline" data-owner-current-page href={`${state.publicOrigin}/cuenta/`} target="_blank" rel="noopener noreferrer">
      Abrir la página actual
    </a>;
  }
  return <button class="button button--outline" type="button" {...{ [dataAttribute]: true }}
    disabled={state.session.state !== 'ready'} onClick={onRetryRead}>{label}</button>;
}
