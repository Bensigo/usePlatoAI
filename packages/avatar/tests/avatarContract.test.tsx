import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import type { VRM } from "@pixiv/three-vrm";
import { describe, expect, it } from "vitest";

import {
  AvatarRenderer,
  avatarAnimationCommands,
  avatarExpressionCommandForEvent,
  avatarExpressionStates,
  avatarCompanionStates,
  avatarCompanionStateForClickReaction,
  avatarEyeDirectionToVrmLookAtTarget,
  avatarEyeDirectionFromCursor,
  avatarEyeDirectionNeutral,
  avatarEyeDirectionStyle,
  avatarHandleVrmRuntimeLoad,
  avatarVrmLoadCapabilityStatus,
  avatarHelloWaveHumanoidBoneMotion,
  avatarIdleWavePolicy,
  avatarLaunchSequence,
  avatarNeutralHumanoidBonePose,
  avatarPackageAssets,
  avatarSpeakingControlsForFrame,
  avatarSpeakingMouthOpenLoop,
  avatarStartupSound,
  avatarTestAnimationCommands,
  avatarVrmEyeGazeCalibration,
  fallbackRendererFor,
  getAvatarRendererConfig,
  getAvatarExpressionCommand,
  millisecondsUntilNextAvatarIdleWave,
  nextAvatarIdleWaveIntervalMs,
  vendoredVrmAssetContract,
  vrmCapabilityInventory,
  vroidAvatarSource,
} from "../src";

type GltfJson = {
  asset?: { generator?: string; version?: string };
  extensionsUsed?: string[];
  extensions?: {
    VRMC_vrm?: {
      meta?: {
        name?: string;
        authors?: string[];
        licenseUrl?: string;
        avatarPermission?: string;
        commercialUsage?: string;
        allowRedistribution?: boolean;
        modification?: string;
        creditNotation?: string;
      };
      humanoid?: { humanBones?: Record<string, unknown> };
      expressions?: {
        preset?: Record<string, unknown>;
        custom?: Record<string, unknown>;
      };
    };
  };
  meshes?: Array<{
    extras?: { targetNames?: string[] };
    primitives?: Array<{ targets?: unknown[] }>;
  }>;
  animations?: Array<{ name?: string }>;
};

function readVendoredVrmJson() {
  const vrmAsset = readFileSync(
    resolve(__dirname, "../assets/vrm/plato.vrm"),
  );

  expect(vrmAsset.toString("utf8", 0, 4)).toBe("glTF");

  let offset = 12;
  while (offset < vrmAsset.length) {
    const chunkLength = vrmAsset.readUInt32LE(offset);
    const chunkType = vrmAsset.readUInt32LE(offset + 4);
    offset += 8;

    if (chunkType === 0x4e4f534a) {
      return JSON.parse(
        vrmAsset.toString("utf8", offset, offset + chunkLength),
      ) as GltfJson;
    }

    offset += chunkLength;
  }

  throw new Error("VRM JSON chunk not found");
}

describe("avatar package contract", () => {
  it("documents the selected VRoid source and local shippable assets", () => {
    expect(vroidAvatarSource.title).toBe("plato");
    expect(vroidAvatarSource.sourceTool).toBe("VRoid Studio 2.12.0");
    expect(vroidAvatarSource.format).toBe("VRM 1.0 / glTF binary");
    expect(vroidAvatarSource.author).toBe("Bensigo");
    expect(vroidAvatarSource.exportedForIssue).toBe(317);
    expect(vroidAvatarSource.license).toMatchObject({
      url: "https://vrm.dev/licenses/1.0/",
      avatarPermission: "everyone",
      commercialUsage: "personalProfit",
      allowRedistribution: true,
      modification: "allowModification",
      creditNotation: "unnecessary",
    });

    for (const asset of Object.values(avatarPackageAssets)) {
      expect(asset.packagePath.startsWith("packages/avatar/")).toBe(true);
      expect(existsSync(resolve(__dirname, "../../..", asset.packagePath))).toBe(
        true,
      );
    }
  });

  it("keeps the vendored VRM asset aligned with the inspected source metadata", () => {
    const gltf = readVendoredVrmJson();
    const vrm = gltf.extensions?.VRMC_vrm;
    const expressions = Object.keys(vrm?.expressions?.preset ?? {});
    const humanoidBones = Object.keys(vrm?.humanoid?.humanBones ?? {});
    const morphTargetNames = new Set(
      (gltf.meshes ?? []).flatMap((mesh) => mesh.extras?.targetNames ?? []),
    );

    expect(gltf.asset?.generator).toBe(vrmCapabilityInventory.generator);
    expect(gltf.extensionsUsed).toEqual(vrmCapabilityInventory.extensionsUsed);
    expect(vrm?.meta).toMatchObject({
      name: "plato",
      authors: ["Bensigo"],
      licenseUrl: "https://vrm.dev/licenses/1.0/",
      avatarPermission: "everyone",
      commercialUsage: "personalProfit",
      allowRedistribution: true,
      modification: "allowModification",
      creditNotation: "unnecessary",
    });
    expect(expressions).toEqual(vrmCapabilityInventory.expressions);
    expect(humanoidBones).toHaveLength(vrmCapabilityInventory.humanoidBoneCount);
    expect(humanoidBones).toEqual(
      expect.arrayContaining([
        "neck",
        "head",
        "leftEye",
        "rightEye",
        "rightShoulder",
        "rightUpperArm",
        "rightLowerArm",
        "rightHand",
      ]),
    );
    for (const mouthTarget of vrmCapabilityInventory.mouthMorphTargets) {
      expect(morphTargetNames).toContain(mouthTarget);
    }
    expect(gltf.animations ?? []).toHaveLength(0);
  });

  it("exports companion states and animation commands required by the milestone slice", () => {
    expect(avatarCompanionStates).toEqual([
      "startup",
      "idle",
      "greeting",
      "listening",
      "thinking",
      "speaking",
      "smile",
      "laugh",
      "sad",
      "error",
      "celebrating",
    ]);
    expect(avatarExpressionStates).toEqual(avatarCompanionStates);
    expect(avatarAnimationCommands).toEqual([
      "expression.startup",
      "expression.idle",
      "expression.greeting",
      "expression.listening",
      "expression.thinking",
      "expression.speaking",
      "expression.smile",
      "expression.laugh",
      "expression.sad",
      "expression.error",
      "expression.celebrating",
    ]);
    expect(avatarTestAnimationCommands).toContain("wave");
  });

  it("maps every companion state to a Three.js VRM renderer config", () => {
    for (const state of avatarCompanionStates) {
      const config = getAvatarRendererConfig(state);

      expect(config.primaryRenderer).toBe("three-vrm");
      expect(config.three.src).toBe("/avatar/plato/vrm/plato.vrm");
      expect(config.three.loader).toBe("@pixiv/three-vrm");
      expect(config.three.renderer).toBe("three");
      expect(config.three.transparentCanvas).toBe(true);
      expect(Object.keys(config.controls)).toEqual([
        "eyeX",
        "eyeY",
        "blink",
        "mouthOpen",
        "smile",
        "laugh",
        "wave",
        "sad",
        "headPitch",
        "headYaw",
        "headRoll",
      ]);
      expect(config.capabilityInventory).toBe(vrmCapabilityInventory);
    }
  });

  it("maps product events through the typed expression controller", () => {
    expect(
      avatarExpressionCommandForEvent({
        type: "presence",
        presenceState: "idle",
      }),
    ).toMatchObject({
      expression: "idle",
      companionState: "idle",
      command: "expression.idle",
    });
    expect(
      avatarExpressionCommandForEvent({
        type: "presence",
        presenceState: "thinking",
      }),
    ).toMatchObject({
      expression: "thinking",
      companionState: "thinking",
      command: "expression.thinking",
    });
    expect(
      avatarExpressionCommandForEvent({
        type: "startup",
        presenceState: "listening",
      }),
    ).toMatchObject({
      expression: "greeting",
      companionState: "greeting",
      command: "expression.greeting",
    });
    expect(
      avatarExpressionCommandForEvent({
        type: "presence",
        presenceState: "speaking",
      }),
    ).toMatchObject({
      expression: "speaking",
      companionState: "speaking",
      command: "expression.speaking",
    });
    expect(
      avatarExpressionCommandForEvent({
        type: "presence",
        presenceState: "waiting_for_approval",
      }),
    ).toMatchObject({
      expression: "sad",
      command: "expression.sad",
    });
    expect(
      avatarExpressionCommandForEvent({
        type: "presence",
        presenceState: "error",
      }),
    ).toMatchObject({
      expression: "error",
      command: "expression.error",
    });
    expect(
      avatarExpressionCommandForEvent({ type: "click-reaction" }),
    ).toMatchObject({
      expression: "smile",
      command: "expression.smile",
    });
    expect(
      avatarExpressionCommandForEvent({ type: "idle-wave" }),
    ).toMatchObject({
      expression: "greeting",
      command: "expression.greeting",
    });
    expect(
      avatarExpressionCommandForEvent({
        type: "test-command",
        command: "wave",
      }),
    ).toMatchObject({
      expression: "greeting",
      command: "expression.greeting",
    });
    expect(
      avatarExpressionCommandForEvent({
        type: "test-command",
        command: "laugh",
      }),
    ).toMatchObject({
      expression: "laugh",
      command: "expression.laugh",
    });
    expect(
      avatarExpressionCommandForEvent({
        type: "test-command",
        command: "celebration",
      }),
    ).toMatchObject({
      expression: "celebrating",
      command: "expression.celebrating",
    });
    expect(
      avatarExpressionCommandForEvent({
        type: "test-command",
        command: "not-a-state",
      }),
    ).toBeNull();
  });

  it("keeps smile, laugh, sad, thinking, and celebration visibly distinct in runtime controls", () => {
    const smile = getAvatarExpressionCommand("smile").controls;
    const laugh = getAvatarExpressionCommand("laugh").controls;
    const sad = getAvatarExpressionCommand("sad").controls;
    const thinking = getAvatarExpressionCommand("thinking").controls;
    const celebrating = getAvatarExpressionCommand("celebrating").controls;

    expect(smile.smile).toBeGreaterThan(0);
    expect(smile.laugh).toBe(0);
    expect(laugh.laugh).toBeGreaterThan(0);
    expect(laugh.mouthOpen).toBeGreaterThan(smile.mouthOpen);
    expect(sad.sad).toBeGreaterThan(0);
    expect(sad.smile).toBe(0);
    expect(thinking.headPitch).toBeGreaterThan(0);
    expect(thinking.headYaw).toBeLessThan(0);
    expect(celebrating.wave).toBeGreaterThan(smile.wave);
    expect(celebrating.laugh).toBeGreaterThan(0);
  });

  it("drives speaking with a changing VRM mouth-control loop", () => {
    const firstFrame = avatarSpeakingControlsForFrame({ frameIndex: 0 });
    const secondFrame = avatarSpeakingControlsForFrame({ frameIndex: 1 });
    const wrappedFrame = avatarSpeakingControlsForFrame({
      frameIndex: avatarSpeakingMouthOpenLoop.length,
    });
    const smileFrame = avatarSpeakingControlsForFrame({
      frameIndex: 1,
      cue: "smile",
    });
    const laughFrame = avatarSpeakingControlsForFrame({
      frameIndex: 1,
      cue: "laugh",
    });

    expect(firstFrame.mouthOpen).toBe(avatarSpeakingMouthOpenLoop[0]);
    expect(secondFrame.mouthOpen).toBe(avatarSpeakingMouthOpenLoop[1]);
    expect(secondFrame.mouthOpen).not.toBe(firstFrame.mouthOpen);
    expect(wrappedFrame.mouthOpen).toBe(firstFrame.mouthOpen);
    expect(smileFrame.smile).toBeGreaterThan(0);
    expect(smileFrame.laugh).toBe(0);
    expect(laughFrame.laugh).toBeGreaterThan(0);
    expect(laughFrame.mouthOpen).toBeGreaterThanOrEqual(
      secondFrame.mouthOpen,
    );
  });

  it("documents the normalized runtime contract with real VRM backing", () => {
    expect(vendoredVrmAssetContract).toMatchObject({
      loader: "@pixiv/three-vrm",
      renderer: "three",
      asset: avatarPackageAssets.vrm,
      transparentCanvas: true,
      framing: {
        subject: "full-body",
        viewportFill: "most-of-height",
      },
    });

    for (const [controlName, control] of Object.entries(
      vendoredVrmAssetContract.runtimeControls,
    )) {
      expect(control.missing, controlName).toBe(false);
      expect(control.backedBy.length, controlName).toBeGreaterThan(0);
    }

    expect(vendoredVrmAssetContract.runtimeControls.laugh.backedBy).toContain(
      "VRM expression: relaxed",
    );
    expect(vendoredVrmAssetContract.runtimeControls.wave.backedBy).toContain(
      "humanoid bone: rightUpperArm",
    );
    expect(vendoredVrmAssetContract.runtimeControls.sad.backedBy).toContain(
      "VRM expression: sad",
    );
    expect(
      vendoredVrmAssetContract.runtimeControls.headPitch.backedBy,
    ).toContain("humanoid bone: head");
    expect(vrmCapabilityInventory.armGestureControls).toEqual(
      expect.arrayContaining([
        "leftUpperArm",
        "leftLowerArm",
        "rightUpperArm",
        "rightLowerArm",
      ]),
    );
    expect(vrmCapabilityInventory.bundledAnimations).toEqual([]);
  });

  it("defines a non-T-pose neutral arm stance before wave motion is applied", () => {
    expect(avatarNeutralHumanoidBonePose.leftUpperArm.z).toBeLessThan(-0.9);
    expect(avatarNeutralHumanoidBonePose.rightUpperArm.z).toBeGreaterThan(0.9);
    expect(Math.abs(avatarNeutralHumanoidBonePose.leftLowerArm.z)).toBeLessThan(
      0.35,
    );
    expect(Math.abs(avatarNeutralHumanoidBonePose.rightLowerArm.z)).toBeLessThan(
      0.35,
    );
    expect(
      vendoredVrmAssetContract.framing.fieldOfViewDegrees,
    ).toBeGreaterThanOrEqual(32);
    expect(vendoredVrmAssetContract.framing.modelPosition[0]).toBe(0);
    expect(vendoredVrmAssetContract.framing.modelScale).toBeGreaterThanOrEqual(
      1,
    );
    expect(vendoredVrmAssetContract.framing.cameraPosition[2]).toBeGreaterThan(
      4.5,
    );
  });

  it("authors a raised forearm and wrist hello-wave motion", () => {
    expect(avatarHelloWaveHumanoidBoneMotion.rightUpperArm.raiseZ).toBeGreaterThan(
      1.5,
    );
    expect(
      avatarHelloWaveHumanoidBoneMotion.rightLowerArm.bendZ,
    ).toBeGreaterThan(1);
    expect(
      avatarHelloWaveHumanoidBoneMotion.rightLowerArm.swayY,
    ).toBeGreaterThan(0.45);
    expect(
      avatarHelloWaveHumanoidBoneMotion.rightLowerArm.palmTwistY,
    ).toBeLessThan(
      -0.9,
    );
    expect(
      avatarHelloWaveHumanoidBoneMotion.rightLowerArm.swayY,
    ).toBeGreaterThan(
      0.5,
    );
    expect(
      avatarHelloWaveHumanoidBoneMotion.oscillationRadiansPerSecond,
    ).toBeGreaterThan(7);
  });

  it("does not expose the old owl or Rive fallback renderer path", () => {
    expect(fallbackRendererFor("missing-vrm-asset")).toEqual({
      renderer: "none",
      reason: "missing-vrm-asset",
      src: null,
    });
    expect(fallbackRendererFor("unsupported-webgl")).toEqual({
      renderer: "none",
      reason: "unsupported-webgl",
      src: null,
    });
    expect(avatarPackageAssets).not.toHaveProperty("rive");
    expect(avatarPackageAssets).not.toHaveProperty("sourceSvg");
  });

  it("maps cursor position into a clamped avatar eye direction", () => {
    const avatarBounds = {
      left: 100,
      top: 200,
      width: 200,
      height: 240,
    };

    expect(
      avatarEyeDirectionFromCursor({
        cursorX: 200,
        cursorY: 200 + 240 * 0.42,
        avatarBounds,
      }),
    ).toEqual(avatarEyeDirectionNeutral);
    expect(
      avatarEyeDirectionFromCursor({
        cursorX: 274,
        cursorY: 200 + 240 * 0.42 + 69.6,
        avatarBounds,
      }),
    ).toEqual({
      x: 0.5,
      y: 0.5,
    });
    expect(
      avatarEyeDirectionFromCursor({
        cursorX: 52,
        cursorY: 200 + 240 * 0.42,
        avatarBounds,
      }),
    ).toEqual({
      x: -1,
      y: 0,
    });
    expect(
      avatarEyeDirectionFromCursor({
        cursorX: 348,
        cursorY: 200 + 240 * 0.42,
        avatarBounds,
      }),
    ).toEqual({
      x: 1,
      y: 0,
    });
    expect(
      avatarEyeDirectionFromCursor({
        cursorX: 200,
        cursorY: 200 + 240 * 0.42 - 139.2,
        avatarBounds,
      }),
    ).toEqual({
      x: 0,
      y: -1,
    });
    expect(
      avatarEyeDirectionFromCursor({
        cursorX: 200,
        cursorY: 200 + 240 * 0.42 + 139.2,
        avatarBounds,
      }),
    ).toEqual({
      x: 0,
      y: 1,
    });
  });

  it("clamps eye direction at the avatar package boundary", () => {
    expect(
      avatarEyeDirectionFromCursor({
        cursorX: 10_000,
        cursorY: -10_000,
        avatarBounds: {
          left: 100,
          top: 200,
          width: 200,
          height: 240,
        },
      }),
    ).toEqual({
      x: 1,
      y: -1,
    });
    expect(
      avatarEyeDirectionFromCursor({
        cursorX: 100,
        cursorY: 100,
        avatarBounds: {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
        },
      }),
    ).toEqual(avatarEyeDirectionNeutral);
    expect(avatarEyeDirectionStyle({ x: 0.25, y: -0.5 })).toEqual({
      "--plato-avatar-eye-x": 0.25,
      "--plato-avatar-eye-y": -0.5,
    });
  });

  it("maps normalized eye controls into a calibrated VRM lookAt target", () => {
    expect(avatarVrmEyeGazeCalibration).toMatchObject({
      controlSource: "vrm-look-at-target",
      backedBy: ["VRM lookAt target", "leftEye bone", "rightEye bone"],
    });
    expect(avatarEyeDirectionToVrmLookAtTarget()).toEqual(
      avatarVrmEyeGazeCalibration.targetNeutral,
    );
    expect(avatarEyeDirectionToVrmLookAtTarget({ x: -1, y: 0 })).toEqual({
      x: -0.45,
      y: 1.24,
      z: 4.97,
    });
    expect(avatarEyeDirectionToVrmLookAtTarget({ x: 1, y: 0 })).toEqual({
      x: 0.45,
      y: 1.24,
      z: 4.97,
    });
    expect(avatarEyeDirectionToVrmLookAtTarget({ x: 0, y: -1 })).toEqual({
      x: 0,
      y: 1.5,
      z: 4.97,
    });
    expect(avatarEyeDirectionToVrmLookAtTarget({ x: 0, y: 1 })).toEqual({
      x: 0,
      y: 0.98,
      z: 4.97,
    });
    expect(avatarEyeDirectionToVrmLookAtTarget({ x: 2, y: -2 })).toEqual({
      x: 0.45,
      y: 1.5,
      z: 4.97,
    });
  });

  it("rejects VRM runtime loading when lookAt capability is missing", () => {
    expect(avatarVrmLoadCapabilityStatus(undefined)).toBe("missing-vrm");
    expect(avatarVrmLoadCapabilityStatus({ lookAt: undefined })).toBe(
      "missing-look-at",
    );
    expect(
      avatarVrmLoadCapabilityStatus({
        lookAt: { target: null } as NonNullable<VRM["lookAt"]>,
      }),
    ).toBe("ready");
  });

  it("keeps missing-lookAt VRMs out of the runtime ready path", () => {
    const loadedScene = { name: "unsupported-vrm-scene" };
    const runtimeEvents: string[] = [];

    const status = avatarHandleVrmRuntimeLoad({
      vrm: {
        lookAt: undefined,
        scene: loadedScene,
      } as unknown as VRM,
      disposeScene: (scene) => {
        expect(scene).toBe(loadedScene);
        runtimeEvents.push("dispose");
      },
      onReady: () => {
        runtimeEvents.push("ready");
      },
      onFailed: (reason) => {
        expect(reason).toBe("missing-look-at");
        runtimeEvents.push("failed");
      },
    });

    expect(status).toBe("missing-look-at");
    expect(runtimeEvents).toEqual(["dispose", "failed"]);
  });

  it("represents startup sound ownership in the avatar package API", () => {
    expect(avatarStartupSound).toEqual({
      id: "plato-startup-chime",
      packagePath: "packages/avatar/assets/audio/plato-startup-chime.wav",
      publicPath: "/avatar/plato/audio/plato-startup-chime.wav",
      playback: "app-launch-or-activation",
      durationMs: 960,
      format: "audio/wav",
      source: "generated-useplatoai",
    });
  });

  it("owns the launch wave sequence through avatar product commands", () => {
    expect(avatarLaunchSequence).toEqual([
      {
        delayMs: 0,
        presenceState: "appearing",
        companionState: "startup",
        command: "expression.startup",
      },
      {
        delayMs: 560,
        presenceState: "listening",
        companionState: "greeting",
        command: "expression.greeting",
      },
      {
        delayMs: 1520,
        presenceState: "idle",
        companionState: "idle",
        command: "expression.idle",
      },
    ]);
  });

  it("maps click reaction to a visible smile plus wave", () => {
    const clickReactionConfig = getAvatarRendererConfig(
      avatarCompanionStateForClickReaction(),
    );

    expect(clickReactionConfig.controls.smile).toBeGreaterThan(0);
    expect(clickReactionConfig.controls.wave).toBeGreaterThan(0);
  });

  it("defines a rate-limited idle wave policy that backs off outside idle", () => {
    expect(avatarIdleWavePolicy).toMatchObject({
      companionState: "greeting",
      command: "expression.greeting",
      initialDelayMs: 90_000,
      minimumIntervalMs: 60_000,
      maximumIntervalMs: 120_000,
      activeStateBackoffMs: 6_000,
      waveDurationMs: 960,
    });
    expect(avatarIdleWavePolicy.pausedPresenceStates).toContain("focused");
    expect(avatarIdleWavePolicy.pausedPresenceStates).toContain("sleeping");
    expect(avatarIdleWavePolicy.pausedPresenceStates).toContain("task_running");

    expect(
      millisecondsUntilNextAvatarIdleWave({
        presenceState: "idle",
        nowMs: 1_000,
        lastWaveAtMs: null,
      }),
    ).toBe(avatarIdleWavePolicy.initialDelayMs);
    expect(
      millisecondsUntilNextAvatarIdleWave({
        presenceState: "idle",
        nowMs: 10_000,
        lastWaveAtMs: 1_000,
        scheduledIntervalMs: 75_000,
      }),
    ).toBe(66_000);
    expect(nextAvatarIdleWaveIntervalMs({ random: () => 0 })).toBe(60_000);
    expect(nextAvatarIdleWaveIntervalMs({ random: () => 0.5 })).toBe(90_000);
    expect(nextAvatarIdleWaveIntervalMs({ random: () => 1 })).toBe(120_000);
    expect(
      millisecondsUntilNextAvatarIdleWave({
        presenceState: "focused",
        nowMs: 10_000,
        lastWaveAtMs: 1_000,
      }),
    ).toBe(avatarIdleWavePolicy.activeStateBackoffMs);
  });

  it("renders a transparent Three.js VRM React entrypoint", () => {
    const markup = renderToStaticMarkup(
      <AvatarRenderer
        companionState="greeting"
        eyeDirection={{
        x: 0.25,
        y: -0.5,
      }}
    />,
  );

    expect(markup).toContain('data-avatar-package="@useplatoai/avatar"');
    expect(markup).toContain('data-avatar-renderer="three-vrm"');
    expect(markup).toContain('data-vrm-runtime-state="loading"');
    expect(markup).toContain('data-three-renderer="three"');
    expect(markup).toContain('data-three-alpha="true"');
    expect(markup).toContain('data-vrm-loader="@pixiv/three-vrm"');
    expect(markup).toContain(
      'data-avatar-eye-control-source="vrm-look-at-target"',
    );
    expect(markup).toContain('data-avatar-control-eye-x="0.25"');
    expect(markup).toContain('data-avatar-control-eye-y="-0.5"');
    expect(markup).toContain('data-avatar-control-smile="0.55"');
    expect(markup).toContain('data-avatar-control-wave="1"');
    expect(markup).toContain('data-avatar-control-sad="0"');
    expect(markup).toContain('data-avatar-control-head-pitch="0"');
    expect(markup).toContain('data-avatar-fallback-state="none"');
    expect(markup).toContain("plato-three-vrm-canvas");
    expect(markup).toContain("/avatar/plato/vrm/plato.vrm");
    expect(markup).not.toContain("wise-owl");
    expect(markup).not.toContain("rive");
    expect(markup).not.toContain("source-svg");
    expect(markup).not.toContain('data-fallback-renderer="svg"');
  });

  it("clamps invalid renderer eye controls before they reach the VRM path", () => {
    const markup = renderToStaticMarkup(
      <AvatarRenderer
        companionState="idle"
        eyeDirection={{
          x: Number.POSITIVE_INFINITY,
          y: 5,
        }}
      />,
    );

    expect(markup).toContain('data-avatar-control-eye-x="0"');
    expect(markup).toContain('data-avatar-control-eye-y="1"');
  });
});
