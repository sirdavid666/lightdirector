export type PublishRequest = { secureStreamUrl: string; grade: unknown };

export async function startPublishing(_request: PublishRequest) {
  throw new Error('Web preview needs a WHIP-to-RTMP relay. Use the Android APK to stream directly to Facebook.');
}

export async function stopPublishing() {
  return undefined;
}
