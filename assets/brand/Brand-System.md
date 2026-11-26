# Fontivo Brand System — v2.0

**Tagline:** Type. Design. Deliver.

## Brand direction
A warm, precise identity for a desktop typography and creative-asset workspace. The signature is the Dual-Ribbon F: two flowing ribbons that suggest type, movement, and creative workflow.

## Approved logo geometry
The two `path d` values in `fontivo-mark.svg` are the immutable source geometry. Do not redraw, simplify, round, skew, or otherwise modify these curves. Variants may change fills, background, and placement only.

## Color palette
| Token | Hex | Role |
|---|---|---|
| Plum Ink | `#291C2E` | Primary dark surface / identity anchor |
| Coral | `#F16B50` | Primary ribbon / primary accent |
| Lavender | `#B7A1D9` | Secondary ribbon / supporting accent |
| Amber | `#F7B544` | Highlight / attention accent |
| Lime | `#C7D65A` | Optional tertiary accent |
| Warm Paper | `#F5EBDD` | Light neutral |
| Paper White | `#FFF9F2` | Bright neutral |
| Warm Gray | `#E8E1D6` | Borders / muted surfaces |
| Slate | `#5A5366` | Secondary text on light surfaces |

Do not claim blanket WCAG AA/AAA compliance. Verify each actual foreground/background pair and interactive state in the product UI. Coral and lavender are brand accents, not automatically body-text colors.

## Typography
- Display: Sora (fallback: Inter, Arial, sans-serif)
- Latin UI: Inter
- Arabic UI: Tajawal, then Noto Sans Arabic
- Technical: JetBrains Mono

Use the same optical hierarchy across Latin and Arabic; test Arabic shaping, diacritics, and mixed-direction strings in the actual app.

## Logo variants
- `app-icons/fontivo-mark.svg`: transparent standalone mark
- `app-icons/fontivo-icon.svg`: app icon on Plum Ink
- `app-icons/fontivo-logo-dark.svg`: dark-background horizontal lockup
- `app-icons/fontivo-logo-light.svg`: light-background horizontal lockup
- `brand/fontivo-mark-animated.svg`: animated mark reveal (reduced-motion safe)

Wordmark SVGs use live text. Convert text to outlines only in a release/export workflow with the approved font installed.

## Motion principles
Keep the supplied animated hero, architecture, and benchmark SVGs animated. Their existing timing and animation mechanics are retained; the brand accent colors are updated. CSS-driven motion assets include `prefers-reduced-motion` overrides. The benchmark graphic also contains SVG SMIL animation; test it in target renderers because SMIL support varies.

## Asset integrity
The legacy file paths are retained for compatibility. Architecture, hero, and benchmark content is preserved from the supplied asset set; no benchmark measurements or product claims have been invented. Review the claims in those source graphics against current product behavior before publishing.
