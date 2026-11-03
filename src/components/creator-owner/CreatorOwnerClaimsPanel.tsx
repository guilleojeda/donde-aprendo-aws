import type { CreatorClaimDTO } from '../../types/creators';
import type { CreatorOwnerState } from '../../lib/creator-owner-state';

interface Props {
  state: CreatorOwnerState;
  disabled: boolean;
  onOpen(): void;
  onCheck(): void;
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

export default function CreatorOwnerClaimsPanel({ state, disabled, onOpen, onCheck, onRetryCatalog }: Props) {
  const titles = new Map<string, string>();
  for (const resource of state.observed.editableResources) titles.set(resource.id, resource.title);
  for (const link of state.observed.links) if (!titles.has(link.resourceId)) titles.set(link.resourceId, link.title);
  for (const resource of state.catalog.entries ?? []) if (!titles.has(resource.id)) titles.set(resource.id, resource.title);

  return <section class="creator-owner__claims" data-owner-claims aria-labelledby="owner-claims-title">
    <header class="creator-owner__section-heading creator-owner__claims-heading"><div>
      <p class="creator-owner__eyebrow">Acceso de edición</p><h2 id="owner-claims-title">Solicitudes</h2>
      <p>Solicitar acceso no agrega contenido a tu página ni concede permiso para editar.</p>
    </div><button class="button button--dark" type="button" data-claim-open data-claim-section-open disabled={disabled || !state.observed.profile} onClick={onOpen}>Solicitar edición</button></header>
    {state.claimHistory.message && <p class="creator-owner__status" data-claim-index-status role={state.claimHistory.status === 'error' ? 'alert' : 'status'} aria-live="polite">{state.claimHistory.message}</p>}
    {state.catalog.status === 'loading' && <p class="creator-owner__status" data-claim-catalog-status role="status" aria-live="polite">Cargando el catálogo público de contenido…</p>}
    {state.catalog.status === 'error' && <p class="creator-owner__status" data-claim-catalog-status role="status" aria-live="polite">
      {state.catalog.message ?? 'No pudimos cargar el catálogo.'} Puedes solicitar edición con una URL conocida.
    </p>}
    <div class="creator-owner__claim-history-actions">
      <button class="button button--outline" type="button" data-claim-history-refresh disabled={disabled || state.claimHistory.status === 'loading'} onClick={onCheck}>
        {state.claimHistory.status === 'loading' ? 'Comprobando solicitudes…' : 'Actualizar solicitudes'}
      </button>
      {state.catalog.status === 'error' && <button class="button button--outline" type="button" data-claim-index-retry onClick={onRetryCatalog}>Reintentar carga del catálogo</button>}
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
