import NodeMediaClient from 'react-native-nodemediaclient';

export type PublishRequest = {
  secureStreamUrl: string;
  grade: unknown;
  width?: number;
  height?: number;
  videoBitrate?: number;
};

let client: any = null;

export async function startPublishing(request: PublishRequest) {
  if (client) {
    client.stop();
    client = null;
  }

  const width = request.width || 1280;
  const height = request.height || 720;
  const bitrate = request.videoBitrate || 4500;
  const fps = height >= 1080 && request.videoBitrate === 6000 ? 60 : 30;

  client = new NodeMediaClient({
    url: request.secureStreamUrl,
    video: {
      width,
      height,
      fps,
      bitrate,
      profile: 'high',
    },
    audio: {
      bitrate: 128,
      sampleRate: 44100,
      channels: 2,
    },
  });

  client.start();
}

export async function stopPublishing() {
  if (client) {
    client.stop();
    client = null;
  }
}
