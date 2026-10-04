/** @param {{ countryName?: string, agendaPath?: string }} [options] */
export function communityFaqItems({ countryName, agendaPath = '/eventos/' } = {}) {
  if (!countryName) return [
    {
      question: '¿Cómo me sumo a una comunidad AWS?',
      answer: 'Abrí la ficha del grupo y seguí los enlaces que publica para conocer sus canales y cómo participar.',
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
      answer: 'Abrí la ficha del grupo y seguí los enlaces que publica para conocer sus canales y cómo participar.',
    },
    {
      question: `¿Dónde encuentro los próximos eventos de las comunidades de ${countryName}?`,
      answer: 'La agenda reúne los próximos eventos publicados por comunidades de ese país y enlaza a su inscripción.',
      links: [{ label: `Ver eventos en ${countryName}`, href: agendaPath }],
    },
  ];
}

export function eventFaqItems({ countryName, collectionKey } = {}) {
  if (countryName) return [
    {
      question: `¿Cómo me inscribo a un evento en ${countryName}?`,
      answer: 'Usá el enlace Inscribirme de la ficha; la inscripción y sus condiciones se gestionan desde la página del organizador.',
    },
    {
      question: '¿En qué zona horaria se muestran los horarios?',
      answer: 'La ficha indica el horario de la comunidad organizadora y, cuando el navegador lo permite, también lo muestra en tu zona horaria.',
    },
    {
      question: '¿Puedo guardar un evento en mi calendario?',
      answer: 'Descargá el archivo .ics de la ficha. Si el organizador actualiza los datos, consultá la página de inscripción.',
    },
  ];
  if (collectionKey === 'online') return [
    {
      question: '¿Cómo recibo el acceso a un evento en línea?',
      answer: 'Abrí Inscribirme en la ficha para consultar el registro y las instrucciones que publique su organizador.',
    },
    {
      question: '¿En qué zona horaria se muestran los horarios?',
      answer: 'Primero se muestra la hora de la comunidad organizadora; el navegador puede mostrar también la conversión a tu zona horaria.',
    },
    {
      question: '¿Puedo guardar la fecha en mi calendario?',
      answer: 'Sí. Descargá el archivo .ics de la ficha y revisá la página de inscripción si el organizador anuncia cambios.',
    },
  ];
  if (collectionKey === 'presenciales') return [
    {
      question: '¿Dónde consulto el lugar del encuentro?',
      answer: 'Revisá el campo Lugar de cada ficha; la modalidad indica si el encuentro es presencial o híbrido.',
    },
    {
      question: '¿Cómo me inscribo?',
      answer: 'Usá Inscribirme en la ficha para abrir el registro y revisar las indicaciones del organizador.',
    },
    {
      question: '¿Puedo guardar la fecha en mi calendario?',
      answer: 'Descargá el archivo .ics de la ficha y consultá la página de inscripción si el organizador publica cambios.',
    },
  ];
  return [
    {
      question: '¿Cómo me inscribo a un evento?',
      answer: 'Usá el enlace Inscribirme de la ficha para abrir la página de registro del organizador.',
    },
    {
      question: '¿En qué zona horaria se muestran los horarios?',
      answer: 'Primero se muestra la hora de la comunidad organizadora; el navegador puede mostrar también la conversión a tu zona horaria.',
    },
    {
      question: '¿Puedo guardar un evento en mi calendario?',
      answer: 'Sí. Descargá el archivo .ics de la ficha y consultá luego la página de inscripción por si el organizador publica cambios.',
    },
  ];
}
