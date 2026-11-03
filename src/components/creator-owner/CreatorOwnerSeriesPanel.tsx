import {
  creatorOwnerChapterOrder,
  creatorOwnerSeriesHref,
  selectCreatorOwnerChapters,
  selectCreatorOwnerSeries,
  type CreatorOwnerSeriesMembership,
  type CreatorOwnerSeriesQuery,
} from '../../lib/creator-owner-series';
import type { CreatorOwnerState } from '../../lib/creator-owner-state';

interface Props {
  state: CreatorOwnerState;
  disabled: boolean;
  onSeriesSearch(value: string): void;
  onChapterSearch(value: string): void;
  onChapterMembership(value: CreatorOwnerSeriesMembership): void;
  onCreate(): void;
  onEditSeries(seriesId: string): void;
  onDeleteSeries(seriesId: string): void;
  onAddChapter(placementId: string): void;
  onRemoveChapter(placementId: string): void;
  onMoveChapter(placementId: string): void;
}

function pageHref(query: CreatorOwnerSeriesQuery, page: number): string {
  return creatorOwnerSeriesHref({ ...query, paginaSeries: page });
}

export default function CreatorOwnerSeriesPanel({ state, disabled, onSeriesSearch, onChapterSearch, onChapterMembership, onCreate, onEditSeries, onDeleteSeries, onAddChapter, onRemoveChapter, onMoveChapter }: Props) {
  const { observed: data, location } = state;
  const query = location.query;
  const seriesSelection = selectCreatorOwnerSeries(data.series, query);
  const selectedSeries = data.series.find(({ id }) => id === query.serie);
  const chapterSelection = selectedSeries ? selectCreatorOwnerChapters(data, query) : undefined;
  const selectedChapterIds = new Set(chapterSelection?.completeOrder.map(({ placementId }) => placementId) ?? []);
  const positions = new Map(chapterSelection?.completeOrder.map((link, index) => [link.placementId, index + 1]) ?? []);
  const canPublish = Boolean(data.profile?.published && !data.profile.hidden);
  const visibleChapters = selectedSeries ? creatorOwnerChapterOrder(data.links, selectedSeries.id).filter((link) => !link.hidden) : [];
  const publicSeriesPath = selectedSeries && data.profile && canPublish && visibleChapters.length
    ? `/c/${encodeURIComponent(data.profile.slug)}/series/${encodeURIComponent(selectedSeries.slug)}/`
    : undefined;
  const seriesCount = `${seriesSelection.totalMatches} ${seriesSelection.totalMatches === 1 ? 'serie' : 'series'}`;
  const chapterCount = `${chapterSelection?.totalMatches ?? 0} ${(chapterSelection?.totalMatches ?? 0) === 1 ? 'coincidencia' : 'coincidencias'} de ${data.links.length} ${data.links.length === 1 ? 'enlace' : 'enlaces'}`;
  const seriesPage = seriesSelection.query.paginaSeries;
  const chapterPage = chapterSelection?.query.paginaCapitulos ?? 1;
  const chapterFilterPage = location.pendingChapterSearch !== query.buscarCapitulos || location.pendingMembership !== query.pertenencia
    ? 1 : chapterPage;

  return <section class="creator-owner__series" data-owner-series aria-labelledby="owner-series-title">
    <header class="creator-owner__section-heading">
      <div>
        <p class="creator-owner__eyebrow">Rutas de aprendizaje</p>
        <h2 id="owner-series-title" tabIndex={-1}>Series</h2>
      </div>
      <button class="button button--dark" type="button" data-series-create-open disabled={disabled} onClick={onCreate}>Crear serie</button>
    </header>

    {state.seriesQueryError && <p class="creator-owner__status creator-owner__status--error" data-series-query-error role="alert">
      La consulta de series no es válida. Revisa la serie, el filtro o la página seleccionada.
    </p>}

    <section class="creator-owner__chapter-view" data-owner-series-chapters hidden={Boolean(state.seriesQueryError) || !selectedSeries} aria-labelledby="owner-series-chapters-title">
      <header class="creator-owner__series-context">
        <a class="button button--outline" data-series-back href={creatorOwnerSeriesHref({ ...query, serie: '', buscarCapitulos: '', pertenencia: 'todos', paginaCapitulos: 1 })}>Volver a series</a>
        <div>
          <h3 id="owner-series-chapters-title" data-series-context-name tabIndex={-1}>{selectedSeries?.name ?? ''}</h3>
          <p data-series-chapter-summary>{chapterSelection?.completeOrder.length ?? 0} {(chapterSelection?.completeOrder.length ?? 0) === 1 ? 'capítulo guardado' : 'capítulos guardados'} en el orden completo.</p>
        </div>
        {selectedSeries && <button class="button button--outline" type="button" data-series-edit data-series-id={selectedSeries.id} disabled={disabled} onClick={() => onEditSeries(selectedSeries.id)}>Editar serie</button>}
      </header>
      <p><a data-series-public href={publicSeriesPath} hidden={!publicSeriesPath} target="_blank" rel="noopener noreferrer">Abrir serie pública</a></p>

      <form class="creator-owner__series-filters creator-owner__series-filters--chapters" method="get" action="/cuenta/" data-series-chapter-filters>
        <input type="hidden" name="vista" value="series" />
        <input type="hidden" name="serie" value={selectedSeries?.id ?? query.serie} />
        <input type="hidden" name="buscarSeries" value={query.buscarSeries} />
        <input type="hidden" name="paginaSeries" value={query.paginaSeries} />
        <div class="creator-owner__field">
          <label for="owner-chapter-search">Buscar en tus enlaces</label>
          <input id="owner-chapter-search" name="buscarCapitulos" type="search" value={location.pendingChapterSearch} data-chapter-search autocomplete="off"
            onInput={(event) => onChapterSearch((event.currentTarget as HTMLInputElement).value)} />
        </div>
        <div class="creator-owner__field">
          <label for="owner-chapter-membership">Pertenencia</label>
          <select id="owner-chapter-membership" name="pertenencia" data-chapter-membership value={location.pendingMembership}
            onChange={(event) => onChapterMembership((event.currentTarget as HTMLSelectElement).value as CreatorOwnerSeriesMembership)}>
            <option value="todos">Todos los enlaces</option>
            <option value="incluidos">Incluidos</option>
            <option value="disponibles">Disponibles</option>
          </select>
        </div>
        <input type="hidden" name="paginaCapitulos" value={chapterFilterPage} />
        <button class="button button--outline" type="submit">Aplicar filtros</button>
      </form>
      <p class="creator-owner__series-count" data-chapter-count>{chapterCount}</p>
      <ol class="creator-owner__chapter-list" data-chapter-rows>
        {chapterSelection?.rows.map((link) => {
          const position = positions.get(link.placementId);
          const included = selectedChapterIds.has(link.placementId);
          return <li class="creator-owner__chapter" data-chapter-row={link.placementId} data-placement-id={link.placementId} key={link.placementId}>
            <div class="creator-owner__chapter-copy">
              <h4>{link.title}</h4>
              <a href={link.url} target="_blank" rel="noopener noreferrer">{link.url}</a>
              <p>{included ? `Incluido en la posición ${position} de ${chapterSelection.completeOrder.length}` : 'Disponible para agregar'}</p>
              {link.hidden && <span class="creator-owner__badge">Oculto en catálogo</span>}
            </div>
            <div class="creator-owner__chapter-actions">
              {included ? <>
                <button class="button button--outline" type="button" data-chapter-move data-placement-id={link.placementId} disabled={disabled} onClick={() => onMoveChapter(link.placementId)}>Mover capítulo</button>
                <button class="button button--outline" type="button" data-chapter-remove data-placement-id={link.placementId} disabled={disabled} onClick={() => onRemoveChapter(link.placementId)}>Quitar capítulo</button>
              </> : <button class="button button--outline" type="button" data-chapter-add data-placement-id={link.placementId} disabled={disabled} onClick={() => onAddChapter(link.placementId)}>Agregar capítulo</button>}
            </div>
          </li>;
        })}
      </ol>
      <p class="creator-owner__empty" data-chapter-empty hidden={!chapterSelection || chapterSelection.rows.length > 0}>
        {chapterSelection?.totalMatches ? 'No hay enlaces en esta página.' : 'No hay enlaces que coincidan con esta búsqueda y pertenencia.'}
      </p>
      <nav class="creator-owner__pagination" data-chapter-pagination aria-label="Páginas de enlaces">
        <span>Página {chapterPage} de {chapterSelection?.pageCount ?? 1}</span>
        {chapterSelection && chapterPage > 1 && <a class="button button--outline" data-series-chapter-page href={creatorOwnerSeriesHref({ ...query, paginaCapitulos: chapterPage - 1 })}>Anterior</a>}
        {chapterSelection && chapterPage < chapterSelection.pageCount && <a class="button button--outline" data-series-chapter-page href={creatorOwnerSeriesHref({ ...query, paginaCapitulos: chapterPage + 1 })}>Siguiente</a>}
      </nav>
      {state.message && <p class="creator-owner__status" data-series-write-status role="status" aria-live="polite">{state.message.text}</p>}
    </section>

    <section class="creator-owner__series-list-view" data-owner-series-list-view hidden={Boolean(state.seriesQueryError) || Boolean(query.serie)}>
      <form class="creator-owner__series-filters" method="get" action="/cuenta/" data-series-filters>
        <input type="hidden" name="vista" value="series" />
        <div class="creator-owner__field">
          <label for="owner-series-search">Buscar series</label>
          <input id="owner-series-search" name="buscarSeries" type="search" value={location.pendingSeriesSearch} data-series-search autocomplete="off"
            onInput={(event) => onSeriesSearch((event.currentTarget as HTMLInputElement).value)} />
        </div>
        <input type="hidden" name="paginaSeries" value={seriesPage} />
        <button class="button button--outline" type="submit">Aplicar búsqueda</button>
      </form>
      <p class="creator-owner__series-count" data-series-count>{seriesCount}</p>
      <ul class="creator-owner__series-list" data-owner-series-list>
        {seriesSelection.rows.map((series) => {
          const visibleCount = data.links.filter((link) => !link.hidden && link.series.some(({ seriesId }) => seriesId === series.id)).length;
          const publicPath = canPublish && visibleCount > 0 && data.profile
            ? `/c/${encodeURIComponent(data.profile.slug)}/series/${encodeURIComponent(series.slug)}/` : undefined;
          return <li class="creator-owner__series-row" id={series.id} data-owner-series-row={series.id} data-series-id={series.id} key={series.id}>
            <div class="creator-owner__series-copy">
              <h3>{series.name}</h3>
              <p>{series.slug}</p>
              <p>{visibleCount} {visibleCount === 1 ? 'capítulo visible' : 'capítulos visibles'}</p>
            </div>
            <div class="creator-owner__series-actions">
              <button class="button button--outline" type="button" data-series-edit data-series-id={series.id} disabled={disabled} onClick={() => onEditSeries(series.id)}>Editar</button>
              <a class="button button--outline" data-series-chapters data-series-id={series.id}
                href={creatorOwnerSeriesHref({ ...query, serie: series.id, buscarCapitulos: '', pertenencia: 'todos', paginaCapitulos: 1 })}>Gestionar capítulos</a>
              <button class="button button--outline" type="button" data-series-delete data-series-id={series.id} disabled={disabled} onClick={() => onDeleteSeries(series.id)}>Eliminar</button>
              {publicPath && <a class="button button--outline" href={publicPath} target="_blank" rel="noopener noreferrer">Abrir serie pública</a>}
            </div>
          </li>;
        })}
      </ul>
      <p class="creator-owner__empty" data-series-empty hidden={seriesSelection.rows.length > 0}>
        {seriesSelection.totalMatches ? 'No hay series en esta página.' : 'No hay series que coincidan con la búsqueda.'}
      </p>
      <nav class="creator-owner__pagination" data-series-pagination aria-label="Páginas de series">
        <span>Página {seriesPage} de {seriesSelection.pageCount}</span>
        {seriesPage > 1 && <a class="button button--outline" data-series-page href={pageHref(seriesSelection.query, seriesPage - 1)}>Anterior</a>}
        {seriesPage < seriesSelection.pageCount && <a class="button button--outline" data-series-page href={pageHref(seriesSelection.query, seriesPage + 1)}>Siguiente</a>}
      </nav>
      {state.message && <p class="creator-owner__status" data-series-write-status role="status" aria-live="polite">{state.message.text}</p>}
    </section>
  </section>;
}
