const utf8Bytes = (value) => Buffer.byteLength(value, 'utf8');

function escapeText(value) {
  return String(value)
    .replace(/\\/gu, '\\\\')
    .replace(/\r\n|\r|\n/gu, '\\n')
    .replace(/[,;]/gu, (mark) => `\\${mark}`)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '');
}

function foldLine(line) {
  const rows = [''];
  let bytes = 0;
  for (const character of line) {
    const size = utf8Bytes(character);
    if (bytes + size > 75) {
      rows.push(' ');
      bytes = 1;
    }
    rows[rows.length - 1] += character;
    bytes += size;
  }
  return rows.join('\r\n');
}

function utcDateTime(value) {
  return new Date(value).toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
}

/** A one-time calendar copy of the approved event, using UTC instants to preserve offsets. */
export function eventCalendar(event, generatedAt = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Donde Aprendo AWS//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@dondeaprendoaws.com`,
    `DTSTAMP:${utcDateTime(generatedAt)}`,
    `DTSTART:${utcDateTime(event.startsAt)}`,
    `DTEND:${utcDateTime(event.endsAt)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(`${event.description}\nInscripción: ${event.registrationUrl}`)}`,
    `URL:${event.registrationUrl}`,
    ...(event.mode !== 'online' && event.place && event.place !== 'Consulta el lugar en Meetup'
      ? [`LOCATION:${escapeText(event.place)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
