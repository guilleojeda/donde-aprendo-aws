import type { CreatorEditorDTO, CreatorSocial } from '../types/creators';

const SOCIAL_LINKS: Record<string, { label: string; key: CreatorSocial }> = {
  'social:instagram': { label: 'Instagram', key: 'instagram' },
  'social:x': { label: 'X', key: 'x' },
  'social:linkedin': { label: 'LinkedIn', key: 'linkedin' },
  'social:aws-builder': { label: 'AWS Builder Center', key: 'awsBuilder' },
  'social:website': { label: 'Sitio web o newsletter', key: 'website' },
};

export function getStatisticsLinkLabel(linkId: string, editor?: CreatorEditorDTO): string {
  if (linkId === '(other)') return 'Otros enlaces agrupados por Google Analytics';
  if (linkId === '(not set)' || linkId.trim() === '') return 'Enlace no identificado';

  const currentLink = editor?.links.find(({ placementId }) => placementId === linkId);
  if (currentLink) return currentLink.title;

  const socialEntry = Object.hasOwn(SOCIAL_LINKS, linkId) ? SOCIAL_LINKS[linkId] : undefined;
  if (socialEntry) {
    const isConfigured = Boolean(editor?.profile?.socials[socialEntry.key]);
    return isConfigured ? socialEntry.label : `${socialEntry.label} (red actualmente no configurada)`;
  }
  return 'Enlace anterior o no disponible';
}

export function isIdentifiableStatisticsLinkId(linkId: string): boolean {
  return linkId.trim() !== ''
    && linkId !== '(other)'
    && linkId !== '(not set)'
    && !linkId.startsWith('social:');
}
