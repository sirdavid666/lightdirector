import NodeMediaClient from 'react-native-nodemediaclient';

export type PublishRequest = { secureStreamUrl: string; grade: unknown };

let client: any = null;

export async function startPublishing(request: PublishRequest) {
  if (client) {
    client.stop();
    client = null;
  }

  // Initialize the native RTMP publisher
  client = new NodeMediaClient({
    url: request.secureStreamUrl, // Facebook's rtmps:// ingest URL
    video: {
      width: 1280,
      height: 720,
      fps: 30,
      bitrate: 4500, // 4.5 Mbps for high quality
      profile: 'high',
    },
    audio: {
      bitrate: 128,
      sampleRate: 44100,
      channels: 2,
    },
  });

  // Start pushing to Facebook!
  client.start();
}

export async function stopPublishing() {
  if (client) {
    client.stop();
    client = null;
  }
}
