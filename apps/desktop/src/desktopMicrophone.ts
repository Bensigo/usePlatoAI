import {
  voiceRuntimeError,
  type VoiceMicrophoneInputAdapter,
  type VoiceRuntimeAdapterResult,
  type VoiceRuntimeOperationContext,
  type VoiceRuntimeStopInput,
} from "@useplatoai/voice";

type DesktopMediaRecorder = Pick<MediaRecorder, "start" | "state" | "stop"> & {
  ondataavailable: ((event: BlobEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onstop: (() => void) | null;
};

type DesktopMediaRecorderConstructor = new (
  stream: MediaStream,
  options?: MediaRecorderOptions,
) => DesktopMediaRecorder;

export type DesktopMicrophoneCaptureDependencies = {
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  MediaRecorderConstructor?: DesktopMediaRecorderConstructor;
  maxCaptureMs?: number;
  mimeType?: string;
  convertToWav?: (audio: Uint8Array, mimeType: string) => Promise<Uint8Array>;
};

type ActiveCapture = {
  recorder: DesktopMediaRecorder;
  stream: MediaStream;
};

const defaultMaxCaptureMs = 3000;
const desktopMicrophoneProviderId = "desktop-microphone";

function successfulCapture(audio: Uint8Array) {
  return {
    status: "success",
    providerId: desktopMicrophoneProviderId,
    audio,
  } as const;
}

function failedCapture(
  code: string,
  message: string,
  retryable: boolean,
): VoiceRuntimeAdapterResult<{ audio: Uint8Array }> {
  return {
    status: "failed",
    providerId: desktopMicrophoneProviderId,
    error: voiceRuntimeError(code, message, retryable),
  };
}

function dependencyMediaDevices(
  dependencies: DesktopMicrophoneCaptureDependencies,
) {
  return (
    dependencies.mediaDevices ??
    (typeof navigator !== "undefined" ? navigator.mediaDevices : undefined)
  );
}

function dependencyMediaRecorder(
  dependencies: DesktopMicrophoneCaptureDependencies,
) {
  return (
    dependencies.MediaRecorderConstructor ??
    (typeof MediaRecorder !== "undefined"
      ? (MediaRecorder as unknown as DesktopMediaRecorderConstructor)
      : undefined)
  );
}

export function isDesktopMicrophoneCaptureAvailable(
  dependencies: DesktopMicrophoneCaptureDependencies = {},
) {
  return Boolean(
    dependencyMediaDevices(dependencies)?.getUserMedia &&
      dependencyMediaRecorder(dependencies),
  );
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function stopRecorder(recorder: DesktopMediaRecorder) {
  if (recorder.state !== "inactive") {
    recorder.stop();
  }
}

function failureFromGetUserMediaError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return failedCapture(
        "microphone_permission_denied",
        "Microphone permission denied. Allow microphone access before starting voice.",
        true,
      );
    }

    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return failedCapture(
        "provider_unavailable",
        "No microphone input device is available.",
        true,
      );
    }
  }

  const message =
    error instanceof Error
      ? error.message
      : "Microphone capture failed before recording started.";
  return failedCapture("provider_error", message, false);
}

async function audioBytesFromChunks(chunks: Blob[], mimeType: string) {
  const blob = new Blob(chunks, { type: mimeType });
  return new Uint8Array(await blob.arrayBuffer());
}

function isWavAudio(audio: Uint8Array) {
  return (
    audio.byteLength >= 12 &&
    audio[0] === 82 &&
    audio[1] === 73 &&
    audio[2] === 70 &&
    audio[3] === 70 &&
    audio[8] === 87 &&
    audio[9] === 65 &&
    audio[10] === 86 &&
    audio[11] === 69
  );
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function wavFromMonoSamples(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2;
  const headerBytes = 44;
  const wav = new ArrayBuffer(headerBytes + samples.length * bytesPerSample);
  const view = new DataView(wav);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = headerBytes;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      offset,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true,
    );
    offset += bytesPerSample;
  }

  return new Uint8Array(wav);
}

async function defaultConvertToWav(audio: Uint8Array) {
  if (isWavAudio(audio)) {
    return audio;
  }

  const AudioContextConstructor =
    typeof AudioContext !== "undefined" ? AudioContext : undefined;

  if (!AudioContextConstructor) {
    throw new Error("Web Audio decode is unavailable.");
  }

  const audioContext = new AudioContextConstructor();
  try {
    const decoded = await audioContext.decodeAudioData(
      new Uint8Array(audio).buffer,
    );
    const frameCount = decoded.length;
    const channelCount = decoded.numberOfChannels;
    const monoSamples = new Float32Array(frameCount);

    for (let channel = 0; channel < channelCount; channel += 1) {
      const channelData = decoded.getChannelData(channel);
      for (let index = 0; index < frameCount; index += 1) {
        monoSamples[index] += channelData[index] / channelCount;
      }
    }

    return wavFromMonoSamples(monoSamples, decoded.sampleRate);
  } finally {
    if ("close" in audioContext) {
      void audioContext.close();
    }
  }
}

export function createDesktopMicrophoneInputAdapter(
  dependencies: DesktopMicrophoneCaptureDependencies = {},
): VoiceMicrophoneInputAdapter {
  let activeCapture: ActiveCapture | null = null;

  async function capture(
    context?: VoiceRuntimeOperationContext,
  ): Promise<VoiceRuntimeAdapterResult<{ audio: Uint8Array }>> {
    if (activeCapture) {
      return failedCapture(
        "microphone_capture_active",
        "Microphone capture is already active.",
        false,
      );
    }

    const mediaDevices = dependencyMediaDevices(dependencies);
    const Recorder = dependencyMediaRecorder(dependencies);

    if (!mediaDevices?.getUserMedia || !Recorder) {
      return failedCapture(
        "provider_unavailable",
        "Desktop microphone capture is unavailable in this runtime.",
        true,
      );
    }

    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (error) {
      return failureFromGetUserMediaError(error);
    }

    if (context?.signal?.aborted) {
      stopStream(stream);
      return failedCapture(
        "operation_aborted",
        "Microphone capture was interrupted.",
        true,
      );
    }

    let recorder: DesktopMediaRecorder;
    try {
      recorder = dependencies.mimeType
        ? new Recorder(stream, { mimeType: dependencies.mimeType })
        : new Recorder(stream);
    } catch (error) {
      stopStream(stream);
      return failedCapture(
        "provider_error",
        error instanceof Error
          ? error.message
          : "Microphone recorder could not be created.",
        false,
      );
    }

    return await new Promise((resolve) => {
      const chunks: Blob[] = [];
      let didSettle = false;
      let maxCaptureTimer: ReturnType<typeof setTimeout> | null = null;

      function cleanup() {
        if (maxCaptureTimer) {
          clearTimeout(maxCaptureTimer);
          maxCaptureTimer = null;
        }
        context?.signal?.removeEventListener("abort", abortCapture);
        stopStream(stream);
        activeCapture = null;
      }

      function settle(result: VoiceRuntimeAdapterResult<{ audio: Uint8Array }>) {
        if (didSettle) {
          return;
        }

        didSettle = true;
        cleanup();
        resolve(result);
      }

      function abortCapture() {
        try {
          stopRecorder(recorder);
        } catch {
          // The abort path must still release tracks and report interruption.
        }
        settle(
          failedCapture(
            "operation_aborted",
            "Microphone capture was interrupted.",
            true,
          ),
        );
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onerror = () => {
        settle(
          failedCapture(
            "provider_error",
            "Microphone recorder failed while capturing audio.",
            false,
          ),
        );
      };
      recorder.onstop = () => {
        void audioBytesFromChunks(
          chunks,
          dependencies.mimeType ?? "audio/webm",
        ).then((audio) => {
          if (audio.byteLength === 0) {
            settle(
              failedCapture(
                "empty_microphone_capture",
                "No microphone audio was captured.",
                true,
              ),
            );
            return;
          }

          const convertToWav = dependencies.convertToWav ?? defaultConvertToWav;
          void convertToWav(audio, dependencies.mimeType ?? "audio/webm").then(
            (wavAudio) => {
              settle(successfulCapture(wavAudio));
            },
            () => {
              settle(
                failedCapture(
                  "invalid_microphone_audio",
                  "Microphone audio could not be converted to 16-bit mono WAV.",
                  true,
                ),
              );
            },
          );
        }, () => {
          settle(
            failedCapture(
              "provider_error",
              "Microphone audio could not be read after capture.",
              false,
            ),
          );
        });
      };

      activeCapture = { recorder, stream };
      context?.signal?.addEventListener("abort", abortCapture, { once: true });
      recorder.start();
      maxCaptureTimer = setTimeout(
        () => stopRecorder(recorder),
        dependencies.maxCaptureMs ?? defaultMaxCaptureMs,
      );
    });
  }

  async function stop(_input?: VoiceRuntimeStopInput) {
    if (!activeCapture) {
      return;
    }

    stopRecorder(activeCapture.recorder);
  }

  return {
    capture,
    stop,
  };
}
