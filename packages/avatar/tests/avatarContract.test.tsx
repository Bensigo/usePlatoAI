import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AvatarRenderer,
  avatarAnimationCommands,
  avatarCompanionStates,
  avatarCompanionStateForClickReaction,
  avatarEyeDirectionFromCursor,
  avatarEyeDirectionNeutral,
  avatarEyeDirectionStyle,
  avatarHelloWaveHumanoidBoneMotion,
  avatarIdleWavePolicy,
  avatarLaunchSequence,
  avatarNeutralHumanoidBonePose,
  avatarPackageAssets,
  avatarStartupSound,
  fallbackRendererFor,
  getAvatarRendererConfig,
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
      "greet",
      "idle",
      "listening",
      "happy",
      "sad",
      "talking",
      "celebrating",
    ]);
    expect(avatarAnimationCommands).toEqual([
      "startup.appear",
      "greet.wave",
      "idle.breathe",
      "voice.listen",
      "mood.smile",
      "mood.sad",
      "voice.talk",
      "celebration.dance",
    ]);
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
      ]);
      expect(config.capabilityInventory).toBe(vrmCapabilityInventory);
    }
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
        command: "startup.appear",
      },
      {
        delayMs: 560,
        presenceState: "listening",
        companionState: "greet",
        command: "greet.wave",
      },
      {
        delayMs: 1520,
        presenceState: "idle",
        companionState: "idle",
        command: "idle.breathe",
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
      companionState: "greet",
      command: "greet.wave",
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
        companionState="greet"
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
    expect(markup).toContain('data-avatar-control-eye-x="0.25"');
    expect(markup).toContain('data-avatar-control-eye-y="-0.5"');
    expect(markup).toContain('data-avatar-control-smile="0.55"');
    expect(markup).toContain('data-avatar-control-wave="1"');
    expect(markup).toContain('data-avatar-fallback-state="none"');
    expect(markup).toContain("plato-three-vrm-canvas");
    expect(markup).toContain("/avatar/plato/vrm/plato.vrm");
    expect(markup).not.toContain("wise-owl");
    expect(markup).not.toContain("rive");
    expect(markup).not.toContain("source-svg");
    expect(markup).not.toContain('data-fallback-renderer="svg"');
  });
});
