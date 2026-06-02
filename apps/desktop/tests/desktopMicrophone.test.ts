import { describe, expect, it, vi } from "vitest";

import {
  createDesktopMicrophoneInputAdapter,
  isDesktopMicrophoneCaptureAvailable,
} from "../src/desktopMicrophone";

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];

  state: RecordingState = "inactive";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor() {
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    if (this.state === "inactive") {
      return;
    }

    this.state = "inactive";
    this.onstop?.();
  }
}

function createStream() {
  const stop = vi.fn();
  return {
    stop,
    stream: {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream,
  };
}

describe("desktop microphone capture", () => {
  it("requests microphone permission only when capture starts and returns recorded bytes", async () => {
    FakeMediaRecorder.instances = [];
    const { stream, stop } = createStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const adapter = createDesktopMicrophoneInputAdapter({
      mediaDevices: { getUserMedia },
      MediaRecorderConstructor: FakeMediaRecorder,
      maxCaptureMs: 50,
    });

    expect(getUserMedia).not.toHaveBeenCalled();

    const capture = adapter.capture();
    await vi.waitFor(() => expect(FakeMediaRecorder.instances).toHaveLength(1));
    FakeMediaRecorder.instances[0]?.ondataavailable?.({
      data: new Blob([new Uint8Array([1, 2, 3])]),
    } as BlobEvent);
    FakeMediaRecorder.instances[0]?.stop();

    await expect(capture).resolves.toEqual({
      status: "success",
      providerId: "desktop-microphone",
      audio: new Uint8Array([1, 2, 3]),
    });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("maps denied microphone permission to an explicit retryable failure", async () => {
    const adapter = createDesktopMicrophoneInputAdapter({
      mediaDevices: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      },
      MediaRecorderConstructor: FakeMediaRecorder,
    });

    await expect(adapter.capture()).resolves.toEqual({
      status: "failed",
      providerId: "desktop-microphone",
      error: {
        code: "microphone_permission_denied",
        message:
          "Microphone permission denied. Allow microphone access before starting voice.",
        retryable: true,
      },
    });
  });

  it("releases microphone tracks when capture is interrupted", async () => {
    FakeMediaRecorder.instances = [];
    const { stream, stop } = createStream();
    const controller = new AbortController();
    const adapter = createDesktopMicrophoneInputAdapter({
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      MediaRecorderConstructor: FakeMediaRecorder,
      maxCaptureMs: 500,
    });

    const capture = adapter.capture({ signal: controller.signal });
    await vi.waitFor(() => expect(FakeMediaRecorder.instances).toHaveLength(1));
    controller.abort();

    await expect(capture).resolves.toMatchObject({
      status: "failed",
      error: {
        code: "operation_aborted",
      },
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable without prompting when browser capture APIs are missing", async () => {
    expect(isDesktopMicrophoneCaptureAvailable()).toBe(false);

    const adapter = createDesktopMicrophoneInputAdapter({});

    await expect(adapter.capture()).resolves.toMatchObject({
      status: "failed",
      error: {
        code: "provider_unavailable",
        message: "Desktop microphone capture is unavailable in this runtime.",
      },
    });
  });

  it("releases microphone tracks when recorder creation fails", async () => {
    const { stream, stop } = createStream();
    const adapter = createDesktopMicrophoneInputAdapter({
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      MediaRecorderConstructor: class {
        constructor() {
          throw new Error("unsupported recorder");
        }
      } as unknown as typeof FakeMediaRecorder,
    });

    await expect(adapter.capture()).resolves.toMatchObject({
      status: "failed",
      error: {
        code: "provider_error",
        message: "unsupported recorder",
      },
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
