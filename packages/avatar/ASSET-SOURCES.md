# Avatar Asset Sources

## Production VRoid VRM Avatar

- Title/name: `plato`
- Source file used for implementation: `/Users/macbook/Downloads/plato.vrm`
- Visual reference: `/Users/macbook/Downloads/plato-vroid-front.png`
- Local package asset: `packages/avatar/assets/vrm/plato.vrm`
- Public runtime copy: `apps/desktop/public/avatar/plato/vrm/plato.vrm`
- Source tool: VRoid Studio 2.12.0
- Format: VRM 1.0 / glTF binary
- Author: Bensigo
- Source issue: GitHub issue #317
- Implementation issue: GitHub issue #311
- Permission correction issue: GitHub issue #319

### Embedded License Metadata

- License URL: https://vrm.dev/licenses/1.0/
- Avatar permission: `everyone`
- Commercial usage: `personalProfit`
- Redistribution: allowed
- Modification: `allowModification`
- Credit notation: unnecessary

The corrected default avatar permission allows app users and downstream redistributors to manipulate/use the bundled default companion avatar as shipped by usePlatoAI. The selected production avatar direction, author attribution, redistribution flag, modification flag, and commercial-use metadata are otherwise unchanged from the operator-selected VRoid source.

### Inspection Summary

- File size: 17,565,172 bytes
- Generator: `VRoid Studio-2.12.0`
- VRM extension: `VRMC_vrm`
- Humanoid bones: 54
- Eye/head controls: `neck`, `head`, `leftEye`, `rightEye`
- Arm gesture controls: `rightShoulder`, `rightUpperArm`, `rightLowerArm`, `rightHand`
- Expressions: `happy`, `angry`, `sad`, `relaxed`, `surprised`, `aa`, `ih`, `ou`, `ee`, `oh`, `blink`, `blinkLeft`, `blinkRight`, `neutral`
- Mouth morph targets include: `Fcl_MTH_A`, `Fcl_MTH_I`, `Fcl_MTH_U`, `Fcl_MTH_E`, `Fcl_MTH_O`, `Fcl_MTH_Close`, `Fcl_MTH_Joy`, `Fcl_MTH_Fun`, `Fcl_MTH_Sorrow`, `Fcl_MTH_Angry`, `Fcl_MTH_Surprised`, `Fcl_MTH_Up`, `Fcl_MTH_Down`, `Fcl_MTH_Large`, `Fcl_MTH_Small`
- Bundled animations: none

### Runtime Contract Notes

The package renderer exposes normalized controls for `eyeX`, `eyeY`, `blink`, `mouthOpen`, `smile`, `laugh`, and `wave`.

- `eyeX` and `eyeY` use the VRM lookAt target backed by the eye bones.
- `blink` uses the real `blink` expression.
- `mouthOpen` uses VRM vowel expressions, primarily `aa` in the first foundation slice.
- `smile` uses the real `happy` expression and joy morph backing.
- `laugh` has no dedicated animation in the VRM, so it maps to real `relaxed`, `happy`, and `aa` expressions.
- `wave` has no bundled animation in the VRM, so it is authored through real humanoid right-arm/hand bone transforms.

The old owl SVG and Rive sample asset were removed from the avatar package runtime path for #311. They are not valid fallbacks for the production VRM direction.

## Startup Sound

- Local file: `packages/avatar/assets/audio/plato-startup-chime.wav`
- Public runtime copy: `apps/desktop/public/avatar/plato/audio/plato-startup-chime.wav`
- Metadata: `packages/avatar/assets/audio/plato-startup-chime.json`
- Source: generated for usePlatoAI
- Usage note: The avatar package owns the startup sound asset and API contract; desktop owns app-launch and explicit activation playback.
