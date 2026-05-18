# Product Experience Direction

This document defines the experience bar for the post-Milestone-004 redesign. It is not final brand polish. It is the product direction that future UI-visible work should build from.

## Experience Goal

Plato should feel like a real desktop companion with taste and presence, not a web dashboard compressed into a transparent window.

The product should communicate:

- alive, but not distracting
- helpful, but not needy
- technical enough for builders, but usable by non-technical users
- private by default, powerful by permission
- memorable and original, not generic AI chrome

## Character Direction

Plato is an original philosopher mascot inspired by the role of classic desktop assistants, not their visual design.

The first character direction is weird and memorable with friendly edges:

- small bottom-anchored presence
- expressive face and posture
- philosopher cues without looking academic or dusty
- clear clickable affordance
- subtle idle motion
- visible transitions for companion state changes

Do not copy Clippy, paperclip silhouettes, Microsoft visual language, or nostalgia as the whole concept. The useful inspiration is the always-present desktop companion pattern.

## Required Companion States

The product state API should support at least:

```txt
appearing
idle
listening
thinking
speaking
waitingApproval
muted
error
```

The renderer may start as static or lightweight animated assets. The state boundary must stay renderer-independent so Live2D or another renderer can replace it later.

## Shell Direction

The desktop shell should prioritize the companion and top-level controls:

- Plato anchored near the bottom of the desktop surface
- compact top Plato control/navigation surface
- clear paths to settings/config, memory, soul, provider/trust, voice, and later tasks
- visible but quiet status indicators
- no nested-card dashboard look
- no placeholder panels once a surface is user-visible

## Audio Direction

Audio should add presence without stealing control:

- a short "coming online" sound may play on first launch or explicit app activation
- clicking Plato should request or enable audio through a clear user-controlled path
- muted, active, unavailable, and error states must be visible
- passive listening must not be implied unless explicitly enabled

## Design System Minimum

Milestone 005 should establish reusable decisions for:

- color roles and state colors
- typography scale
- spacing scale
- radius and border use
- elevation/shadow use
- motion duration and easing
- component disabled, hover, active, loading, and error states
- empty states and offline states

These rules do not need to be final brand guidelines, but they must be concrete enough that Milestone 006+ feature work does not invent new UI patterns casually.

## Quality Gate

Every UI-visible implementation after this direction exists should include visual evidence. For Milestone 005, evidence must cover:

- main shell
- top Plato control/navigation surface
- Plato companion states
- memory and soul surfaces
- settings/config and provider/trust surfaces
- audio activation and muted states

If a surface exists but still looks like a placeholder, the milestone is not done.
