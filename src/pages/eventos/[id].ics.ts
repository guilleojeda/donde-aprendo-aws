import type { APIRoute, GetStaticPaths } from 'astro';
import { loadSiteCatalog } from '../../lib/site-catalog.mjs';
import { uniqueUpcomingEvents } from '../../lib/events.mjs';
import { eventCalendar } from '../../lib/event-calendar.mjs';
import type { CatalogEvent, CatalogResource } from '../../types/catalog';

export const getStaticPaths: GetStaticPaths = async () => {
  const catalog = await loadSiteCatalog() as Array<CatalogEvent | CatalogResource>;
  const events = uniqueUpcomingEvents(catalog.filter((record): record is CatalogEvent => record.recordType === 'event')) as CatalogEvent[];
  return events.map((event) => ({ params: { id: event.id }, props: { event } }));
};

export const GET: APIRoute = ({ props }) => {
  const event = props.event as CatalogEvent;
  return new Response(eventCalendar(event), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${event.id}.ics"`,
    },
  });
};
