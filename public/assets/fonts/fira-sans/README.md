# Fira Sans webfont assets

These unmodified WOFF2 files come from the official Google Fonts CSS endpoint for Fira Sans normal weights 400, 500, and 700. Each file retains its official Unicode subset and is listed with its original download URL in `SOURCES.md`.

Upstream project: https://github.com/google/fonts/tree/main/ofl/firasans
Source CSS: https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;700&display=swap
License: SIL Open Font License 1.1, copied in `OFL.txt` from https://raw.githubusercontent.com/google/fonts/main/ofl/firasans/OFL.txt

`src/styles/fonts.css` pairs these faces with local Arial fallbacks. Regular and medium match the fonts' normalized x-height (Fira 527/1000 and 529/1000; Arial 1062/2048). Bold matches aggregate normalized advances across eleven representative page headings (Fira 162260; Arial Bold 173192.922), preventing the homepage title from gaining a line on mobile. Ascent/descent overrides divide Fira's 93.5%/26.5% metrics by each `size-adjust` multiplier, since that multiplier also scales overrides. Recalculate these values and check wrapping if the fonts or heading styles change. Devices without Arial continue to Helvetica or the browser's sans-serif fallback.
