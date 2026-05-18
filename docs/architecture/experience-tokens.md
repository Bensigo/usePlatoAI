# Experience Tokens

Issue #137 establishes the first reusable experience foundation for Milestone 005. The app source of truth is `apps/desktop/src/experienceTokens.ts`; rendered CSS variables are injected into every desktop shell state so tokens are available before onboarding, during onboarding, and in the main presence shell.

## Token Roles

- Color roles separate companion identity from state feedback. Use `companion` for Plato-owned selection and primary action treatments, `surface` for translucent desktop panels, `text` for primary copy, `textMuted` for secondary metadata, and `controlHover` for non-layout-changing hover feedback.
- State colors map visible behavior to meaning: idle, listening, thinking, speaking, waiting approval, muted, error, offline, loading, disabled, and empty. Avatar and surface work should use these roles instead of inventing new one-off colors.
- Typography tokens cover the current compact desktop scale: caption, label, control, and body. Keep hero-scale type out of compact panels.
- Spacing tokens intentionally stay tight. Existing visible surfaces are small desktop companion controls, not dashboards.
- Radius and border tokens keep repeated panels at 8px or less while allowing pill controls only for icon-sized affordances and compact chips.
- Elevation tokens distinguish floating companion presence from ordinary panels. Do not add nested card shadows inside control surfaces.
- Motion tokens define short UI feedback and slower companion-state motion. State changes may animate, but layout should not jump.

## Component State Rules

- Hover: raise contrast through hover background or border only; do not shift layout.
- Active: use companion color fills for selected controls and state-specific avatar color for presence.
- Disabled: keep controls visible, mute contrast, and remove action affordance through the disabled attribute.
- Loading: use short direct copy and the loading state color only while data is unresolved.
- Error: use the error state color with repair-oriented copy near the failed control.
- Empty: keep the surface in place with muted copy and one next action when available.
- Offline: use muted/offline color and say which capability is unavailable without implying passive listening.

## Current Consumption

The desktop shell consumes the token CSS variables in `apps/desktop/src/styles.css` for the visible Plato avatar, restore card, top control navigation, panel chrome, typography, motion timing, and companion state colors. Future Milestone 005 slices should extend this same token file before adding new UI-specific constants.
