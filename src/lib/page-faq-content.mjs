/** @param {{ countryName?: string, agendaPath?: string }} [options] */
export function communityFaqItems({ countryName, agendaPath = '/eventos/' } = {}) {
  if (!countryName) return [
    {
      question: '¿Cómo me sumo a una comunidad AWS?',
      answer: 'Abre la ficha del grupo y sigue los enlaces que publica para conocer sus canales y cómo participar.',
    },
    {
      question: '¿Dónde encuentro próximos eventos de AWS?',
      answer: 'La agenda reúne los encuentros publicados por comunidades AWS y enlaza a la inscripción de cada evento.',
      links: [{ label: 'Ver eventos AWS', href: agendaPath }],
    },
  ];
  return [
    {
      question: `¿Cómo me sumo a una comunidad AWS en ${countryName}?`,
      answer: 'Abre la ficha del grupo y sigue los enlaces que publica para conocer sus canales y cómo participar.',
    },
    {
      question: '¿Dónde encuentro próximos eventos de AWS?',
      answer: `La agenda abre con ubicación presencial en ${countryName} y también permite consultar participación online de eventos publicados desde cualquier país. Puedes cambiar modalidad y ubicación; cada ficha enlaza a la inscripción.`,
      links: [{ label: `Ver eventos con asistencia presencial en ${countryName}`, href: agendaPath }],
    },
  ];
}

export function eventFaqItems({ countryName, collectionKey } = {}) {
  const historyHelp = 'La agenda incluye finalizados; desmarca Incluir eventos finalizados para ver sólo próximos y en curso. La opción vuelve a activarse al abrir o recargar la agenda.';
  const zoneHelp = 'Las fechas y horas principales usan la zona horaria seleccionada en la agenda. Puedes cambiarla en Más filtros; las semanas y los meses usan esa misma zona. La ficha conserva también el horario del organizador como referencia.';
  const selectionHelp = countryName
    ? `Esta ruta abre con ${countryName} como ubicación presencial predeterminada. Los eventos online están disponibles desde cualquier país. Cambia modalidad, país o ciudad para ajustar la consulta; Solo online incluye la participación remota de eventos híbridos y desactiva temporalmente los controles de ubicación.`
    : collectionKey === 'online'
      ? 'Esta ruta abre con Solo online como modalidad predeterminada e incluye la participación remota de eventos híbridos. Cambia los controles para consultar otra modalidad; la ubicación se conserva mientras Solo online está seleccionado.'
      : collectionKey === 'presenciales'
        ? 'Esta ruta abre con Solo presencial como modalidad predeterminada e incluye eventos híbridos con sede coincidente. Cambia los controles para consultar otra modalidad o ubicación.'
        : 'La agenda abre en modalidad Presencial + online y sin ubicación preseleccionada. Cambia modalidad, país o ciudad; Solo online incluye la participación remota de eventos híbridos y conserva inactiva la ubicación.';
  if (countryName) return [
    {
      question: '¿Cómo elegir modalidad e inscribirme a un evento?',
      answer: `${selectionHelp} Usa Inscribirme para los eventos próximos o en curso; la inscripción y sus condiciones se gestionan desde la página del organizador. En los finalizados, Ver evento permite consultar su página original. ${historyHelp}`,
    },
    {
      question: '¿En qué zona horaria se muestran los horarios?',
      answer: zoneHelp,
    },
    {
      question: '¿Puedo guardar un evento en mi calendario?',
      answer: 'Descarga el archivo .ics de la ficha. Si el organizador actualiza los datos, consulta la página de inscripción.',
    },
  ];
  if (collectionKey === 'online') return [
    {
      question: '¿Cómo elegir modalidad y recibir acceso a un evento en línea?',
      answer: `${selectionHelp} Abre Inscribirme para consultar el registro y las instrucciones del organizador. Si el evento ya finalizó, Ver evento abre su página original. ${historyHelp}`,
    },
    {
      question: '¿En qué zona horaria se muestran los horarios?',
      answer: zoneHelp,
    },
    {
      question: '¿Puedo guardar la fecha en mi calendario?',
      answer: 'Sí. Descarga el archivo .ics de la ficha y revisa la página de inscripción si el organizador anuncia cambios.',
    },
  ];
  if (collectionKey === 'presenciales') return [
    {
      question: '¿Cómo elegir modalidad y consultar el lugar?',
      answer: `${selectionHelp} Revisa el campo Lugar de cada ficha; la modalidad indica si el encuentro es presencial o híbrido.`,
    },
    {
      question: '¿Cómo me inscribo?',
      answer: `Usa Inscribirme para abrir el registro y revisar las indicaciones del organizador. En los finalizados, Ver evento abre la página original. ${historyHelp}`,
    },
    {
      question: '¿Puedo guardar la fecha en mi calendario?',
      answer: 'Descarga el archivo .ics de la ficha y consulta la página de inscripción si el organizador publica cambios.',
    },
  ];
  return [
    {
      question: '¿Cómo elegir modalidad e inscribirme a un evento?',
      answer: `${selectionHelp} Usa Inscribirme para abrir la página de registro del organizador. En los finalizados, Ver evento permite consultar su página original. ${historyHelp}`,
    },
    {
      question: '¿En qué zona horaria se muestran los horarios?',
      answer: zoneHelp,
    },
    {
      question: '¿Puedo guardar un evento en mi calendario?',
      answer: 'Sí. Descarga el archivo .ics de la ficha y consulta luego la página de inscripción por si el organizador publica cambios.',
    },
  ];
}
