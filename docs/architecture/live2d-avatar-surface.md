# Live2D Avatar Surface Contract

The desktop presence renders through `Live2DAvatarSurface`, which accepts the
renderer-independent `AvatarPresenceState` union from
`apps/desktop/src/avatarSurface.tsx`.
The React placeholder is intentionally shaped like a Live2D adapter boundary so
final character art can replace the placeholder without changing product state.

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

- `motionGroup`: the Live2D motion group to play, such as `idle`, `tap_body`,
  `thinking`, `speak`, `approval`, `quiet`, `appear`, or `error`
- `expression`: the Live2D expression preset to apply
- `parameterHints`: initial model parameter targets for eye openness, mouth
  openness, and body angle
- `statusText`: user-visible presence copy outside the renderer

## Asset Expectations

Future Live2D assets should provide compatible motion groups and expression
presets matching the hook names. If a model uses different internal filenames,
the Live2D runtime adapter should translate these product hook names to model
asset paths. Product code should continue to pass `AvatarPresenceState`, not
model-specific filenames or renderer commands.
