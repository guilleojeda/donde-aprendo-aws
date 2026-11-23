import type { CreatorClaimDTO } from '../../types/creators';
import { deriveCreatorOwnerRecoveryAction, type CreatorOwnerState } from '../../lib/creator-owner-state';
import CreatorOwnerReadRecoveryAction from './CreatorOwnerReadRecoveryAction';

interface Props {
  state: CreatorOwnerState;
  disabled: boolean;
  onOpen(): void;
  onRefresh(): void;
  onRetryRead(): void;
  onRetryCatalog(): void;
}

function claimStatus(claim: CreatorClaimDTO): string {
  if (!claim.status) return 'Solicitud recibida';
  const labels: Record<string, string> = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', revoked: 'Revocada', resolved: 'Resuelta', partial: 'Parcialmente resuelta' };
  return labels[claim.status] ?? claim.status;
}

function dateLabel(value: number | undefined): { iso: string; text: string } | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return { iso: date.toISOString(), text: new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) };
}

export default function CreatorOwnerClaimsPanel({ state, disabled, onOpen, onRefresh, onRetryRead, onRetryCatalog }: Props) {
  const titles = new Map<string, string>();
  for (const resource of state.observed.resources) titles.set(resource.id, resource.title);
  for (const resource of state.catalog.entries ?? []) if (!titles.has(resource.id)) titles.set(resource.id, resource.title);
  const recoveryAction = deriveCreatorOwnerRecoveryAction(state);
  const claimsReadPending = recoveryAction.kind === 'pending' && recoveryAction.surface === 'claims'
    && state.operation.status === 'reading' && state.operation.fact === 'claims';
  const claimsReadFailure = (recoveryAction.kind === 'retry' || recoveryAction.kind === 'session-check') && recoveryAction.surface === 'claims'
    && state.operation.status === 'refresh-failed' && state.operation.fact === 'claims' ? state.operation : undefined;
  const showCatalogStatus = state.editor?.kind !== 'claim';
  const catalogFailed = showCatalogStatus && state.catalog.status === 'error';

  return <section class="creator-owner__claims" data-owner-claims aria-labelledby="owner-claims-title">
    <header class="creator-owner__section-heading creator-owner__claims-heading"><div>
      <p class="creator-owner__eyebrow">Acceso de edición</p><h2 id="owner-claims-title" tabIndex={-1}>Solicitudes</h2>
      <p>Solicitar acceso no agrega contenido a tu página ni concede permiso para editar.</p>
    </div><button class="button button--dark" type="button" data-claim-open data-claim-section-open
      aria-describedby={!state.observed.profile ? 'creator-owner-claims-requirement' : undefined}
      disabled={disabled || !state.observed.profile} onClick={onOpen}>Solicitar edición</button></header>
    {!state.observed.profile && <div class="creator-owner__section-requirement" data-claims-create-requirement role="status">
      <p id="creator-owner-claims-requirement">Primero prepara tu página para solicitar edición.</p>
      <a class="button button--outline" href="#owner-create-name">Preparar tu página</a>
    </div>}
    {claimsReadPending && <p class="creator-owner__status" data-claim-index-status role="status" aria-live="polite">Actualizando solicitudes…</p>}
    {claimsReadFailure && <p class="creator-owner__status creator-owner__status--error" data-claim-index-status data-owner-stale role="alert" aria-live="polite">{claimsReadFailure.message}</p>}
    {showCatalogStatus && state.catalog.status === 'loading' && <p class="creator-owner__status" data-claim-catalog-status role="status" aria-live="polite">Cargando el catálogo público de contenido…</p>}
    {catalogFailed && <p class="creator-owner__status creator-owner__status--error" data-claim-catalog-status role="alert">
      {state.catalog.message ?? 'No pudimos cargar el catálogo.'} Puedes solicitar edición con una URL conocida.
    </p>}
    <div class="creator-owner__claim-history-actions">
      <button class="button button--outline" type="button" data-claim-history-refresh disabled={disabled || state.operation.status !== 'idle'} onClick={onRefresh}>
        {claimsReadPending ? 'Actualizando solicitudes…' : 'Actualizar solicitudes'}
      </button>
      {claimsReadFailure && <CreatorOwnerReadRecoveryAction state={state} dataAttribute="data-owner-refresh-retry" label="Reintentar actualización" onRetryRead={onRetryRead} />}
      {catalogFailed && <button class="button button--outline" type="button" data-claim-index-retry onClick={onRetryCatalog}>Reintentar carga del catálogo</button>}
    </div>
    <ul class="creator-owner__claim-history" data-claim-history>
      {state.observed.claims.length ? state.observed.claims.map((claim) => {
        const date = dateLabel(claim.createdAt);
        return <li class="creator-owner__claim-record" data-claim-record={claim.id} key={claim.id}>
          <div class="creator-owner__claim-heading"><strong data-claim-status>{claimStatus(claim)}</strong>{date && <time data-claim-date dateTime={date.iso}>{date.text}</time>}</div>
          <ul class="creator-owner__claim-resources">{claim.resourceIds.map((resourceId) => {
            const label = titles.get(resourceId) ?? claim.resources?.find(({ resourceId: id }) => id === resourceId)?.url ?? 'Contenido solicitado';
            return <li data-claim-resource-id={resourceId} key={resourceId}>{label}</li>;
          })}</ul>
          {claim.evidence !== undefined && <p class="creator-owner__claim-evidence" data-claim-evidence-text>{claim.evidence}</p>}
        </li>;
      }) : <li class="creator-owner__empty" data-claim-empty>No tienes solicitudes todavía.</li>}
    </ul>
  </section>;
}
