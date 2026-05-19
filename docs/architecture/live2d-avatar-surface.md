# Live2D Avatar Surface Contract

The desktop presence renders through `Live2DAvatarSurface`, which accepts the
renderer-independent `AvatarPresenceState` union from
`apps/desktop/src/avatarSurface.tsx`.
The current renderer uses generated Plato character PNG assets for the visible
surface while keeping Live2D-compatible motion and expression hooks at the
adapter boundary.

## Product States

The first supported presence states are:

- `idle`
- `listening`
- `thinking`
- `speaking`
- `appearing`
- `waitingApproval`
- `muted`
- `error`

Each state maps to a `Live2DAvatarSurfaceHook` with:

- `assetSrc`: the generated Plato raster asset used by the current renderer
- `motionGroup`: the Live2D motion group to play, such as `idle`, `tap_body`,
  `thinking`, `speak`, `approval`, `quiet`, `appear`, or `error`
- `expression`: the Live2D expression preset to apply
- `parameterHints`: initial model parameter targets for eye openness, mouth
  openness, and body angle
- `statusText`: user-visible presence copy outside the renderer

## Asset Expectations

Current generated assets live under `apps/desktop/public/avatar/plato/` and
must stay consistent across all supported states:

- `appearing.png`
- `idle.png`
- `listening.png`
- `thinking.png`
- `speaking.png`
- `waitingApproval.png`
- `muted.png`
- `error.png`

Future Live2D assets should provide compatible motion groups and expression
presets matching the hook names. If a model uses different internal filenames,
the Live2D runtime adapter should translate these product hook names to model
asset paths. Product code should continue to pass `AvatarPresenceState`, not
model-specific filenames or renderer commands.
