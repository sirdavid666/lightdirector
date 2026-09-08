import { NativeModules, NativeEventEmitter, EmitterSubscription } from 'react-native';

export type OverlayState = {
  scripture: { reference: string; text: string } | null;
  lyrics: { title: string; line: string; index: number; total: number } | null;
  ticker: { text: string; scrollSpeed: number } | null;
  lowerThird: { name: string; role: string } | null;
  countdown: { secondsLeft: number } | null;
  layout: string;
};

export type PublishRequest = {
  secureStreamUrl: string;
  width: number;
  height: number;
  fps: number;
  videoBitrate: number;
};

export type StreamCallbacks = {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
};

const nativeCompositor = NativeModules.NativeCompositor;
const eventEmitter = new NativeEventEmitter(nativeCompositor as any);
const listeners: EmitterSubscription[] = [];

export async function startPublishing(
  request: PublishRequest,
  callbacks?: StreamCallbacks,
): Promise<void> {
  const onConnected = eventEmitter.addListener('onStreamConnected', () => callbacks?.onConnected?.());
  const onDisconnected = eventEmitter.addListener('onStreamDisconnected', () => callbacks?.onDisconnected?.());
  const onError = eventEmitter.addListener('onStreamError', (e: { error: string }) => callbacks?.onError?.(e.error));
  listeners.push(onConnected, onDisconnected, onError);
  try {
    await nativeCompositor.startStreamWithConfig(
      request.secureStreamUrl,
      request.width,
      request.height,
      request.fps,
      request.videoBitrate
    );
  } catch (err) {
    for (const sub of listeners) sub.remove();
    listeners.length = 0;
    throw err;
  }
}

export async function stopPublishing(): Promise<void> {
  await nativeCompositor.stopStream();
  for (const sub of listeners) sub.remove();
  listeners.length = 0;
}

export async function setOverlayState(state: OverlayState): Promise<void> {
  await nativeCompositor.setOverlayState(JSON.stringify(state));
}

export async function setGrade(preset: string): Promise<void> {
  await nativeCompositor.setGrade(preset);
}

export async function setAudioBalance(micGain: number, mediaGain: number): Promise<void> {
  await nativeCompositor.setAudioBalance(micGain, mediaGain);
}

export async function showImageMedia(filePath: string): Promise<void> {
  await nativeCompositor.showImageMedia(filePath);
}

export async function clearImageMedia(): Promise<void> {
  await nativeCompositor.clearImageMedia();
}

export async function startFileVideoStream(filePath: string, url: string): Promise<void> {
  await nativeCompositor.startFileVideoStream(filePath, url);
}

export async function stopFileStream(): Promise<void> {
  await nativeCompositor.stopFileStream();
}
