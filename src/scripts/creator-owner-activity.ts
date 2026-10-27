import { parseCreatorStatisticsReady } from '../lib/creator-statistics-response';
import type { CreatorStatisticsReady } from '../lib/creator-statistics-types';

type ActivityPeriod = 7 | 30;

const owner = document.querySelector<HTMLElement>('[data-creator-owner]');
const activity = owner?.querySelector<HTMLElement>('[data-owner-activity]');

if (owner && activity) {
  const activeActivity = activity;
  const status = activity.querySelector<HTMLElement>('[data-owner-activity-status]');
  const retry = activity.querySelector<HTMLButtonElement>('[data-owner-activity-retry]');
  const values = new Map<string, HTMLElement>();
  activity.querySelectorAll<HTMLElement>('[data-owner-activity-total]').forEach((element) => {
    if (element.dataset.ownerActivityTotal) values.set(element.dataset.ownerActivityTotal, element);
  });
  const startDate = activity.querySelector<HTMLTimeElement>('[data-owner-activity-start]');
  const endDate = activity.querySelector<HTMLTimeElement>('[data-owner-activity-end]');
  const timeZone = activity.querySelector<HTMLElement>('[data-owner-activity-time-zone]');
  const updated = activity.querySelector<HTMLTimeElement>('[data-owner-activity-updated]');
  const totalGroup = activity.querySelector<HTMLElement>('[data-owner-activity-total-group]');
  const detailLinks = activity.querySelectorAll<HTMLAnchorElement>('[data-owner-activity-detail]');
  const periodControls = activity.querySelectorAll<HTMLButtonElement>('[data-owner-activity-period]');
  const dateFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'UTC' });
  const countFormatter = new Intl.NumberFormat('es-AR');

  let selectedPeriod: ActivityPeriod = activity.dataset.ownerActivityInitialPeriod === '7' ? 7 : 30;
  let requestSequence = 0;
  let ownerKey = '';

  function renderPeriodControls() {
    for (const control of periodControls) {
      control.setAttribute('aria-pressed', String(Number(control.dataset.ownerActivityPeriod) === selectedPeriod));
    }
    const href = `/cuenta/?vista=estadisticas&periodo=${selectedPeriod}&pagina=1`;
    for (const link of detailLinks) link.setAttribute('href', href);
    totalGroup?.setAttribute('aria-label', `Totales de los últimos ${selectedPeriod} días`);
  }

  function setStatus(message: string, kind: 'info' | 'error' | 'success' = 'info', canRetry = false) {
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
    status.hidden = false;
    if (retry) retry.hidden = !canRetry;
  }

  function showReport(value: CreatorStatisticsReady) {
    const totals: Array<[string, number | null]> = [
      ['views', value.totals.views],
      ['visitors', value.totals.visitors],
      ['clicks', value.totals.clicks],
    ];
    for (const [name, count] of totals) {
      const target = values.get(name);
      if (target) target.textContent = count === null ? 'Datos limitados' : countFormatter.format(count);
    }

    if (startDate) {
      startDate.dateTime = value.range.startDate;
      startDate.textContent = dateFormatter.format(new Date(`${value.range.startDate}T12:00:00Z`));
    }
    if (endDate) {
      endDate.dateTime = value.range.endDate;
      endDate.textContent = dateFormatter.format(new Date(`${value.range.endDate}T12:00:00Z`));
    }
    if (timeZone) timeZone.textContent = `· Zona ${value.range.timeZone}`;
    if (updated) {
      updated.dateTime = value.updatedAt;
      updated.textContent = new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: value.range.timeZone,
      }).format(new Date(value.updatedAt));
    }

    const limited = value.warnings.length > 0;
    const limitedNotice = limited ? ' Algunas cifras o detalles pueden estar incompletos.' : '';
    if (value.freshness === 'stale') {
      setStatus(`No pudimos actualizar; mostramos el informe anterior y conservamos sus fechas.${limitedNotice}`, 'info', true);
    } else {
      setStatus(`Actividad actualizada para los últimos ${value.period} días.${limitedNotice}`, limited ? 'info' : 'success');
    }
  }

  function clearReport() {
    for (const element of values.values()) element.textContent = '—';
    for (const date of [startDate, endDate, updated]) {
      if (!date) continue;
      date.removeAttribute('datetime');
      date.textContent = '';
    }
    if (timeZone) timeZone.textContent = '';
  }

  function requestFailureMessage(responseStatus?: number): string {
    if (responseStatus === 401) return 'Tu sesión terminó. No modificamos tu página; vuelve a ingresar para consultar las estadísticas.';
    if (responseStatus === 403) return 'Esta cuenta no tiene acceso a estas estadísticas.';
    return 'No pudimos cargar las estadísticas. Tu página sigue disponible; inténtalo de nuevo.';
  }

  async function loadActivity() {
    const creatorId = activeActivity.dataset.ownerCreatorId;
    if (!creatorId) {
      setStatus('No pudimos confirmar la página para consultar estas estadísticas.', 'error', true);
      return;
    }

    const sequence = ++requestSequence;
    if (retry) retry.hidden = true;
    setStatus(`Cargando estadísticas de los últimos ${selectedPeriod} días…`);
    const target = new URL('/api/creador/estadisticas/', window.location.origin);
    target.searchParams.set('periodo', String(selectedPeriod));
    target.searchParams.set('pagina', '1');

    try {
      const response = await fetch(target, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (sequence !== requestSequence) return;
      if (!response.ok) {
        setStatus(requestFailureMessage(response.status), 'error', true);
        return;
      }

      const body: unknown = await response.json();
      if (sequence !== requestSequence) return;
      const parsed = parseCreatorStatisticsReady(body, selectedPeriod, 1, creatorId);
      if (!parsed) {
        setStatus('No pudimos validar estas estadísticas. No mostramos cifras que no correspondan a tu página.', 'error', true);
        return;
      }
      showReport(parsed);
    } catch {
      if (sequence !== requestSequence) return;
      setStatus(requestFailureMessage(), 'error', true);
    }
  }

  function setPeriod(value: string | undefined) {
    if (value !== '7' && value !== '30') return;
    const next = Number(value) as ActivityPeriod;
    if (next === selectedPeriod) return;
    selectedPeriod = next;
    clearReport();
    renderPeriodControls();
    void loadActivity();
  }

  function readOwnerState() {
    const state = activeActivity.dataset.ownerProfileState;
    const creatorId = activeActivity.dataset.ownerCreatorId ?? '';
    const key = `${state ?? ''}:${creatorId}`;
    if (key === ownerKey) return;
    ownerKey = key;

    const canRead = (state === 'published' || state === 'hidden') && Boolean(creatorId);
    if (!canRead) {
      requestSequence += 1;
      clearReport();
      return;
    }
    void loadActivity();
  }

  renderPeriodControls();
  for (const control of periodControls) {
    control.addEventListener('click', (event) => {
      event.preventDefault();
      setPeriod(control.dataset.ownerActivityPeriod);
    });
  }
  retry?.addEventListener('click', (event) => {
    event.preventDefault();
    void loadActivity();
  });
  activeActivity.addEventListener('creator-owner:profile-updated', readOwnerState);
  readOwnerState();
}
