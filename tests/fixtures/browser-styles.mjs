export async function themeColor(page, property) {
  return page.evaluate((name) => {
    const sample = document.createElement('span');
    sample.style.color = `var(${name})`;
    document.body.append(sample);
    const color = getComputedStyle(sample).color;
    sample.remove();
    return color;
  }, property);
}
