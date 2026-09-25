// The same static build can also be reached through Amplify's default hostname.
// Only the production domain sends pageviews to the existing GA4 property.
if (window.location.hostname === 'dondeaprendoaws.com' && !window.__dondeAnalyticsStarted) {
  window.__dondeAnalyticsStarted = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', 'G-3NXS6QFKHZ');

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=G-3NXS6QFKHZ';
  document.head.appendChild(tag);
}
