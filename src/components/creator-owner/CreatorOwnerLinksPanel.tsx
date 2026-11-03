import { creatorOwnerLinksCountLabel, creatorOwnerLinksHref, selectCreatorOwnerLinks, type CreatorOwnerLinksQuery } from '../../lib/creator-owner-links';
import type { CreatorOwnerState } from '../../lib/creator-owner-state';

interface Props {
  state: CreatorOwnerState;
  disabled: boolean;
  onSearch(value: string): void;
  onQueryChange(query: CreatorOwnerLinksQuery, focusSelector: string): void;
  onQuerySubmit(query: CreatorOwnerLinksQuery): void;
  onAdd(): void;
  onCatalog(): void;
  onEditLink(placementId: string): void;
  onClaim(placementId: string): void;
  onMoveLink(placementId: string): void;
  onRemoveLink(placementId: string): void;
  onEditRetained(resourceId: string): void;
  onReinclude(resourceId: string): void;
}

const DIRECTORY_LABELS: Record<string, string> = { pending: 'Pendiente', approved: 'Aprobado', revoked: 'Revocado' };

export default function CreatorOwnerLinksPanel({ state, disabled, onSearch, onQueryChange, onQuerySubmit, onAdd, onCatalog, onEditLink, onClaim, onMoveLink, onRemoveLink, onEditRetained, onReinclude }: Props) {
  const { observed: data, location } = state;
  const selection = selectCreatorOwnerLinks(data.links, data.series, location.linksQuery);
  const pending = location.pendingLinksQuery;
  const activeResourceIds = new Set(data.links.map(({ resourceId }) => resourceId));
  const retained = data.editableResources.filter(({ id }) => !activeResourceIds.has(id));
  const selectedCount = selection.totalMatches;
  const showFilterNote = pending.serie !== 'todos' || pending.directorio !== 'todos' || pending.destacado !== 'todos' || pending.orden !== 'pagina';

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;
    const values = new FormData(form);
    onQuerySubmit({
      buscar: String(values.get('buscar') ?? ''), serie: String(values.get('serie') ?? 'todos'),
      directorio: String(values.get('directorio') ?? 'todos') as CreatorOwnerLinksQuery['directorio'],
      destacado: String(values.get('destacado') ?? 'todos') as CreatorOwnerLinksQuery['destacado'],
      orden: String(values.get('orden') ?? 'pagina') as CreatorOwnerLinksQuery['orden'], paginaEnlaces: 1,
    });
  }

  function filterChanged(event: Event) {
    const form = (event.currentTarget as HTMLSelectElement).form;
    if (!form) return;
    const values = new FormData(form);
    const query: CreatorOwnerLinksQuery = {
      buscar: String(values.get('buscar') ?? pending.buscar), serie: String(values.get('serie') ?? 'todos'),
      directorio: String(values.get('directorio') ?? 'todos') as CreatorOwnerLinksQuery['directorio'],
      destacado: String(values.get('destacado') ?? 'todos') as CreatorOwnerLinksQuery['destacado'],
      orden: String(values.get('orden') ?? 'pagina') as CreatorOwnerLinksQuery['orden'], paginaEnlaces: 1,
    };
    const selector = event.currentTarget instanceof HTMLSelectElement ? `#${event.currentTarget.id}` : '#owner-link-search';
    onQueryChange(query, selector);
  }

  return <section class="creator-owner__links" data-owner-links aria-labelledby="owner-links-title" data-links-count={data.links.length}>
    <header class="creator-owner__section-heading creator-owner__links-heading">
      <div><p class="creator-owner__eyebrow">Contenido de tu página</p><h2 id="owner-links-title" tabIndex={-1}>Enlaces</h2><p data-link-count>{creatorOwnerLinksCountLabel(selectedCount, selection.totalLinks)}</p></div>
      {data.profile && <div class="creator-owner__link-actions">
        <button class="button button--outline" type="button" data-catalog-open disabled={disabled} onClick={onCatalog}>Buscar en el catálogo</button>
        <button class="button button--dark" type="button" data-link-add-open disabled={disabled} onClick={onAdd}>Agregar enlace</button>
      </div>}
    </header>

    {location.linksQueryError ? <div class="creator-owner__links-error" role="alert" data-links-query-error>
      <p>La búsqueda o los filtros de la URL no son válidos. No mostramos la colección como si estuviera vacía.</p>
      <a class="button button--outline" href="/cuenta/?vista=enlaces">Limpiar búsqueda y filtros</a>
    </div> : <>
      <form class="creator-owner__link-filters" method="get" action="/cuenta/" data-link-filters onSubmit={submit}>
        <input type="hidden" name="vista" value="enlaces" />
        <input type="hidden" name="paginaEnlaces" value={selection.query.paginaEnlaces} />
        <div class="creator-owner__field creator-owner__link-search">
          <label htmlFor="owner-link-search">Buscar título, URL o serie</label>
          <input id="owner-link-search" type="search" name="buscar" value={pending.buscar} data-link-search autoComplete="off"
            onInput={(event) => onSearch((event.currentTarget as HTMLInputElement).value)} />
        </div>
        <label class="creator-owner__field"><span>Serie</span><select id="owner-link-series" name="serie" value={pending.serie} onChange={filterChanged}>
          <option value="todos">Todas las series</option>{data.series.map((series) => <option value={series.id} key={series.id}>{series.name}</option>)}
        </select></label>
        <label class="creator-owner__field"><span>Directorio</span><select id="owner-link-directory" name="directorio" value={pending.directorio} onChange={filterChanged}>
          <option value="todos">Todos los estados</option><option value="propuestos">Propuestos</option><option value="no-propuestos">No propuestos</option>
          <option value="pendientes">Pendientes</option><option value="aprobados">Aprobados</option><option value="revocados">Revocados</option><option value="ocultos">Ocultos</option>
        </select></label>
        <label class="creator-owner__field"><span>Destacados</span><select id="owner-link-featured" name="destacado" value={pending.destacado} onChange={filterChanged}>
          <option value="todos">Todos</option><option value="si">Destacados</option><option value="no">Sin destacar</option>
        </select></label>
        <label class="creator-owner__field"><span>Orden de consulta</span><select id="owner-link-order" name="orden" value={pending.orden} onChange={filterChanged}>
          <option value="pagina">Orden de tu página</option><option value="titulo-asc">Título A–Z</option><option value="titulo-desc">Título Z–A</option>
        </select></label>
        <button class="button button--outline creator-owner__filter-submit" type="submit">Aplicar filtros</button>
      </form>
      {showFilterNote && <p class="creator-owner__filter-note">El orden de consulta sólo organiza esta tabla; no cambia el orden público de tu página.</p>}
      <p class="creator-owner__series-count" data-link-count-summary aria-live="polite">{creatorOwnerLinksCountLabel(selectedCount, selection.totalLinks)}</p>

      <div class="creator-owner__table-scroll" tabIndex={0} aria-label="Tabla de enlaces">
        <table class="creator-owner__link-table">
          <thead><tr><th scope="col">Contenido</th><th scope="col">Series</th><th scope="col">Directorio</th><th scope="col">Destacado</th><th scope="col">Acciones</th></tr></thead>
          <tbody data-link-rows>{selection.rows.map((link) => {
            const editable = data.editableResources.some(({ id }) => id === link.resourceId);
            const seriesNames = link.series.map(({ seriesId }) => data.series.find(({ id }) => id === seriesId)?.name).filter((name): name is string => Boolean(name));
            let domain = link.url;
            try { domain = new URL(link.url).host; } catch { /* DTO validation owns link URL shape. */ }
            const visibility = data.profile?.hidden ? 'Página oculta por administración'
              : !data.profile?.published ? 'Página no pública hasta publicar'
                : link.hidden ? 'Ficha oculta en la página pública' : 'Visible en la página pública';
            return <tr data-link-row={link.placementId} data-placement-id={link.placementId} key={link.placementId}>
              <th scope="row"><span class="creator-owner__link-title" data-link-title>{link.title}</span><span class="creator-owner__link-url">{domain}</span></th>
              <td data-label="Series">{seriesNames.length ? seriesNames.join(', ') : 'Sin serie'}</td>
              <td class="creator-owner__link-status" data-label="Directorio"><span>{link.selectedForDirectory ? 'Propuesta al directorio' : 'No propuesta'}</span>
                <span>{DIRECTORY_LABELS[link.directoryApproval] ?? 'Sin revisión'}</span><span>{visibility}</span></td>
              <td data-label="Destacado">{link.featured ? 'Destacado' : 'Sin destacar'}</td>
              <td class="creator-owner__link-actions" data-label="Acciones">
                <button class="button button--outline" type="button" data-link-edit data-placement-id={link.placementId} disabled={disabled} onClick={() => onEditLink(link.placementId)}>{editable ? 'Editar ficha' : 'Editar opciones'}</button>
                {!editable && <button class="button button--outline" type="button" data-claim-open data-placement-id={link.placementId} disabled={disabled} aria-label={`Solicitar edición de ${link.title}`} onClick={() => onClaim(link.placementId)}>Solicitar edición</button>}
                <button class="button button--outline" type="button" data-link-move data-placement-id={link.placementId} disabled={disabled} aria-label={`Mover ${link.title} a otra posición`} onClick={() => onMoveLink(link.placementId)}>Mover a la posición…</button>
                <button class="button button--outline" type="button" data-link-remove data-placement-id={link.placementId} disabled={disabled} onClick={() => onRemoveLink(link.placementId)}>Quitar de tu página</button>
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <p class="creator-owner__empty" data-link-empty hidden={selection.rows.length > 0}>
        {selection.totalMatches ? 'No hay enlaces en esta página de resultados.' : data.links.length ? 'No hay enlaces que coincidan con estos filtros.' : 'Todavía no agregaste enlaces.'}
      </p>
      <nav id="owner-link-pagination" class="creator-owner__link-pagination" aria-label="Páginas de enlaces" data-link-pagination tabIndex={-1}>
        <span>Página {selection.query.paginaEnlaces} de {selection.pageCount}</span>
        {selection.query.paginaEnlaces > 1 && <a class="button button--outline" data-link-page href={creatorOwnerLinksHref(selection.query, selection.query.paginaEnlaces - 1)}>Anterior</a>}
        {selection.query.paginaEnlaces < selection.pageCount && <a class="button button--outline" data-link-page href={creatorOwnerLinksHref(selection.query, selection.query.paginaEnlaces + 1)}>Siguiente</a>}
      </nav>
    </>}

    {data.profile && <section class="creator-owner__retained" data-owner-retained-links aria-labelledby="owner-retained-title" hidden={!retained.length}>
      <h3 id="owner-retained-title">Contenido que puedes volver a agregar</h3>
      <ul data-retained-resources>{retained.map((resource) => {
        let domain = resource.url;
        try { domain = new URL(resource.url).host; } catch { /* DTO validation owns resource URL shape. */ }
        return <li data-retained-resource={resource.id} key={resource.id}>
          <span><strong>{resource.title}</strong><span class="creator-owner__link-url">{domain}</span></span>
          <span class="creator-owner__link-actions">
            <button class="button button--outline" type="button" data-retained-edit data-resource-id={resource.id} disabled={disabled} onClick={() => onEditRetained(resource.id)}>Editar ficha</button>
            <button class="button button--outline" type="button" data-resource-reinclude data-resource-id={resource.id} disabled={disabled} onClick={() => onReinclude(resource.id)}>Volver a agregar</button>
          </span>
        </li>;
      })}</ul>
    </section>}
  </section>;
}
