# Live2D Avatar Surface Contract

The desktop presence renders through `Live2DAvatarSurface`, which accepts the
renderer-independent `AvatarPresenceState` union from
`apps/desktop/src/avatarSurface.tsx`.
The current renderer uses the Plato mascot assets as the primary visible
companion surface while keeping Live2D-compatible motion and expression hooks at
the adapter boundary. Renderer-independent means product state should not depend
on renderer internals; it does not mean the default avatar can regress to an
abstract placeholder.

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

- `avatarAssetPath`: the default Plato mascot asset for the state
- `motionGroup`: the Live2D motion group to play, such as `idle`, `tap_body`,
  `thinking`, `speak`, `approval`, `quiet`, `appear`, or `error`
- `expression`: the Live2D expression preset to apply
- `parameterHints`: initial model parameter targets for eye openness, mouth
  openness, and body angle
- `statusText`: user-visible presence copy outside the renderer

## Renderer Expectations

The visible default renderer must stay recognizably Plato. Normal avatar states
render the mascot asset mapped by `avatarAssetPath`, and the abstract
`live2d-presence-mark` is reserved as a fallback/loading/error-safe surface. Each
state should expose the same `data-live2d-motion-group` and
`data-live2d-expression` hooks that a future Live2D adapter will consume.

Future Live2D assets should provide compatible motion groups and expression
presets matching the hook names. If a model uses different internal filenames,
the Live2D runtime adapter should translate these product hook names to model
asset paths. Product code should continue to pass `AvatarPresenceState`, not
model-specific filenames or renderer commands.
