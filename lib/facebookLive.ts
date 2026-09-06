import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';

const graphVersion = 'v22.0';
const tokenKey = 'lightcast-facebook-token';

export type FacebookDestination = { id: string; name: string; accessToken: string; kind: 'Page' | 'Group' };
export type FacebookLiveVideo = { id: string; secureStreamUrl: string; streamKey?: string };

WebBrowser.maybeCompleteAuthSession();

const graphUrl = (path: string) => `https://graph.facebook.com/${graphVersion}/${path}`;
const getAppId = () => process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;
const parseParams = (url: string) => new URLSearchParams(url.split(/[?#]/)[1] ?? '');

export const getFacebookToken = () => AsyncStorage.getItem(tokenKey);
export const disconnectFacebook = () => AsyncStorage.removeItem(tokenKey);

export async function connectFacebook(redirectUrl: string) {
  const appId = getAppId();
  if (!appId || appId === 'YOUR_FACEBOOK_APP_ID') throw new Error('Add your Facebook App ID to EXPO_PUBLIC_FACEBOOK_APP_ID before connecting Facebook.');
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUrl,
    response_type: 'token',
    scope: 'pages_show_list,pages_manage_posts,publish_video,groups_access_member_info',
  });
  const result = await WebBrowser.openAuthSessionAsync(`https://www.facebook.com/${graphVersion}/dialog/oauth?${params.toString()}`, redirectUrl);
  if (result.type !== 'success') throw new Error('Facebook sign-in was cancelled.');
  const token = parseParams(result.url).get('access_token');
  if (!token) throw new Error('Facebook did not return an access token. Check the app redirect URI.');
  await AsyncStorage.setItem(tokenKey, token);
  return token;
}

async function graph<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${graphUrl(path)}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`, init);
  const json = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok || json.error) throw new Error(json.error?.message ?? 'Facebook request failed.');
  return json;
}

export async function listFacebookDestinations(token: string): Promise<FacebookDestination[]> {
  const pages = await graph<{ data?: { id: string; name: string; access_token: string }[] }>('me/accounts?fields=id,name,access_token', token);
  const groups = await graph<{ data?: { id: string; name: string }[] }>('me/groups?fields=id,name', token).catch(() => ({ data: [] }));
  return [
    ...(pages.data ?? []).map((page) => ({ id: page.id, name: page.name, accessToken: page.access_token, kind: 'Page' as const })),
    ...(groups.data ?? []).map((group) => ({ id: group.id, name: group.name, accessToken: token, kind: 'Group' as const })),
  ];
}

export async function createFacebookLiveVideo(destination: FacebookDestination): Promise<FacebookLiveVideo> {
  const result = await graph<{ id: string; secure_stream_url: string; stream_url?: string }>(`${destination.id}/live_videos`, destination.accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'status=LIVE_NOW',
  });
  const secureStreamUrl = result.secure_stream_url ?? result.stream_url;
  if (!secureStreamUrl) throw new Error('Facebook did not return a secure stream URL.');
  return { id: result.id, secureStreamUrl, streamKey: secureStreamUrl.split('/').pop() };
}

export const endFacebookLiveVideo = (videoId: string, token: string) =>
  graph(videoId, token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'end_live_video=true' });
