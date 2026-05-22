# Avatar Asset Sources

## Product Mascot Source

- Title: Wise Owl - Colour
- Source URL: https://openclipart.org/detail/303927/wise-owl-colour
- Artist: j4p4n, remix of `wise owl on books` by johnny_automatic
- License: CC0 1.0 / public domain dedication
- Attribution: Not required by the license. Keep this source note for provenance.
- Commercial use: Allowed.
- Local derivative: `packages/avatar/assets/source/wise-owl-colour.svg`

Openclipart's FAQ states that its clipart is released under Creative Commons Zero and may be used commercially. The local SVG is a simplified product derivative used as the fallback visual source for the first Plato mascot slice.

## Initial Rive Runtime Asset

- Source repository: https://github.com/rive-app/rive-react
- Source file: `examples/public/avatars.riv`
- Local file: `packages/avatar/assets/rive/plato-companion.riv`
- License: MIT, from the source repository license at https://github.com/rive-app/rive-react/blob/main/LICENSE
- Attribution: Keep the MIT license/provenance in this document.
- Usage note: This is the first Rive runtime asset that establishes the Rive-backed avatar path. It is not the final bespoke Plato character export.

## Startup Sound Hook

- Local file: `packages/avatar/assets/audio/plato-startup-chime.json`
- Usage note: The avatar package owns the startup sound API contract now; real audio decoding/playback remains desktop-owned in a later slice.
