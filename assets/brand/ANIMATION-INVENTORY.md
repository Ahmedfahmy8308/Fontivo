# SVG Motion Inventory

The following supplied SVGs are animated and remain animated in this package:

- `architecture-diagram.svg` — CSS keyframes for flow lines, staged pulses, and live beacon.
- `architecture-flow.svg` — same supplied animated architecture composition.
- `hero-banner.svg` — CSS keyframes for status pulse, toggle, reveal, toast, beam flow, and aura motion.
- `fontivo-hero-demo.svg` — same supplied animated hero composition.
- `benchmarks.svg` — SVG SMIL `<animate>` element(s).
- `brand/fontivo-mark-animated.svg` — new Dual-Ribbon mark reveal; respects `prefers-reduced-motion`.

The existing animation declarations/timing in the supplied five source SVGs were retained; only signature accent color literals were changed. CSS motion files have a reduced-motion override. `benchmarks.svg` also hides its SMIL animation elements under `prefers-reduced-motion`; this is best-effort because SMIL support and reduced-motion handling vary by renderer, so test it in the target application/browser.
