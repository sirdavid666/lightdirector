import { NativeModules, NativeEventEmitter, EmitterSubscription } from 'react-native';

type OverlayState = {
  scripture: { reference: string; text: string } | null;
  lyrics: { title: string; line: string; index: number; total: number } | null;
  ticker: { text: string; scrollSpeed: number } | null;
  lowerThird: { name: string; role: string } | null;
  countdown: { secondsLeft: number } | null;
  layout: 'Worship' | 'Sermon' | 'ScriptureFull' | 'LyricsFull' | 'CameraOnly' | 'Blank';
};

type PublishRequest = {
  secureStreamUrl: string;
  grade?: any;
  width?: number;
  height?: number;
  videoBitrate?: number;
};

type StreamCallbacks = {
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
  const onConnected = eventEmitter.addListener('onStreamConnected', () => {
    callbacks?.onConnected?.();
  });
  const onDisconnected = eventEmitter.addListener('onStreamDisconnected', () => {
    callbacks?.onDisconnected?.();
  });
  const onError = eventEmitter.addListener('onStreamError', (e: { error: string }) => {
    callbacks?.onError?.(e.error);
  });
  listeners.push(onConnected, onDisconnected, onError);
  try {
    await nativeCompositor.startStream(request.secureStreamUrl);
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
  const json = JSON.stringify(state);
  await nativeCompositor.setOverlayState(json);
}

export {
  OverlayState,
  PublishRequest,
  StreamCallbacks,
  startPublishing,
  stopPublishing,
  setOverlayState,
};
