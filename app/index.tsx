import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Switch, Animated, requireNativeComponent } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type Layout, type LiveItem, type GradeSettings, type RoomCommand,
  defaultGrade, layoutForItem,
} from '@/lib/lightcast';
import { connectRoom, type RoomConnection } from '@/lib/roomSync';
import {
  connectFacebook, getFacebookToken, disconnectFacebook,
  listFacebookDestinations, createFacebookLiveVideo, endFacebookLiveVideo,
  type FacebookDestination,
} from '@/lib/facebookLive';
import { startPublishing, stopPublishing, setOverlayState } from '@/lib/streamingService';
import * as Linking from 'expo-linking';

const NativeCompositorView = requireNativeComponent<any>('NativeCompositorView');

const LAYOUTS: Layout[] = ['Worship', 'Sermon', 'Scripture Full', 'Lyrics Full', 'Camera Only', 'Blank'];
const SCENES = ['Camera', 'Bible', 'Lyrics', 'Lower Third', 'Ticker', 'Countdown', 'Blank'] as const;
const CATEGORIES = ['Praise', 'Worship', 'Scripture', 'Sermon', 'Offering', 'Announce', 'Prayer', 'Special', 'Closing'];
const GRADE_PRESETS: GradeSettings['preset'][] = ['Natural', 'Warm Church', 'Cool', 'Cinematic', 'Vivid', 'Flat/Log lift'];

const RES_MAP: Record<string, { width: number; height: number; videoBitrate: number }> = {
  '720p30': { width: 1280, height: 720, videoBitrate: 2500 },
  '1080p30': { width: 1920, height: 1080, videoBitrate: 4500 },
  '1080p60': { width: 1920, height: 1080, videoBitrate: 6000 },
};

type Tab = 'Scenes' | 'Library' | 'Rundown' | 'Settings';
type RundownItem = { id: string; text: string; category: string };
type PendingRequest = { secureStreamUrl: string; width: number; height: number; videoBitrate: number };

async function fetchBibleVerse(reference: string, version: 'KJV' | 'YOR'): Promise<{ reference: string; text: string; found: boolean }> {
  const translation = version === 'YOR' ? 'yoruba' : 'kjv';
  const apiRef = reference.trim().replace(/\s+/g, '+');
  try {
    const url = `https://bible-api.com/${encodeURIComponent(apiRef)}?translation=${translation}`;
    const response = await fetch(url);
    if (!response.ok) return { reference, text: 'Verse not found. Try "John 3:16"', found: false };
    const data = await response.json() as { reference: string; text: string; translation_name: string };
    const cleanText = (data.text || '').replace(/\n+$/g, '').trim();
    return { reference: data.reference || reference, text: cleanText, found: true };
  } catch {
    return { reference, text: 'Could not fetch verse. Check connection.', found: false };
  }
}

export default function DirectorConsole() {
  const [permission, requestPermission] = useCameraPermissions();
  const [tab, setTab] = useState<Tab>('Scenes');

  const [programLayout, setProgramLayout] = useState<Layout>('Camera Only');
  const [previewLayout, setPreviewLayout] = useState<Layout>('Worship');
  const [liveItem, setLiveItem] = useState<LiveItem>(null);
  const previousLayout = useRef<Layout>('Camera Only');

  const [isLive, setIsLive] = useState(false);
  const [streamMode, setStreamMode] = useState(false);
  const [pendingReq, setPendingReq] = useState<PendingRequest | null>(null);
  const startCalled = useRef(false);

  const [fbDestinations, setFbDestinations] = useState<FacebookDestination[]>([]);
  const [selectedDest, setSelectedDest] = useState<FacebookDestination | null>(null);

  const [roomCode, setRoomCode] = useState('LIGHT-247');
  const [roomStatus, setRoomStatus] = useState('Not connected');
  const room = useRef<RoomConnection | null>(null);

  const [grade, setGrade] = useState<GradeSettings>(defaultGrade);

  const [savedVerses, setSavedVerses] = useState<any[]>([]);
  const [songs, setSongs] = useState<{ title: string; lines: string[] }[]>([]);
  const [announcements, setAnnouncements] = useState<string[]>([]);
  const [verseRef, setVerseRef] = useState('');
  const [verseText, setVerseText] = useState('');
  const [verseVersion, setVerseVersion] = useState<'KJV' | 'YOR'>('KJV');
  const [fetching, setFetching] = useState(false);

  const [songTitle, setSongTitle] = useState('');
  const [songLines, setSongLines] = useState('');
  const [editingSong, setEditingSong] = useState<number | null>(null);
  const [annText, setAnnText] = useState('');
  const [editingAnn, setEditingAnn] = useState<number | null>(null);

  const [lowerName, setLowerName] = useState('Pastor David');
  const [lowerRole, setLowerRole] = useState('Senior Pastor');
  const [tickerText, setTickerText] = useState('Welcome to service — God bless you! GOFF 3.0 is starting soon.');
  const [countMins, setCountMins] = useState('5');

  const [rundown, setRundown] = useState<RundownItem[]>([]);
  const [activeRundown, setActiveRundown] = useState<string | null>(null);
  const [rdText, setRdText] = useState('');
  const [rdCat, setRdCat] = useState(CATEGORIES[0]);

  const [pipOn, setPipOn] = useState(true);
  const [resolution, setResolution] = useState('1080p30');
  const [bitrate, setBitrate] = useState('4.5');
  const [lyricsColor, setLyricsColor] = useState('#22c55e');
  const [rtmpUrl, setRtmpUrl] = useState('');
  const [rtmpKey, setRtmpKey] = useState('');

  const [countSecs, setCountSecs] = useState(0);

  useEffect(() => {
    (async () => {
      const sv = await AsyncStorage.getItem('savedVerses'); if (sv) setSavedVerses(JSON.parse(sv));
      const so = await AsyncStorage.getItem('songs'); if (so) setSongs(JSON.parse(so));
      const an = await AsyncStorage.getItem('announcements'); if (an) setAnnouncements(JSON.parse(an));
      const rd = await AsyncStorage.getItem('rundown'); if (rd) setRundown(JSON.parse(rd));
      const rc = await AsyncStorage.getItem('roomCode'); if (rc) setRoomCode(rc);
      const ru = await AsyncStorage.getItem('rtmpUrl'); if (ru) setRtmpUrl(ru);
      const rk = await AsyncStorage.getItem('rtmpKey'); if (rk) setRtmpKey(rk);
      const ln = await AsyncStorage.getItem('lowerName'); if (ln) setLowerName(ln);
      const lr = await AsyncStorage.getItem('lowerRole'); if (lr) setLowerRole(lr);
      const tt = await AsyncStorage.getItem('tickerText'); if (tt) setTickerText(tt);
      const cm = await AsyncStorage.getItem('countMins'); if (cm) setCountMins(cm);
      const rs = await AsyncStorage.getItem('resolution'); if (rs) setResolution(rs);
    })();
  }, []);

  useEffect(() => {
    room.current?.disconnect();
    const conn = connectRoom(roomCode, handleRoomCommand, setRoomStatus);
    room.current = conn;
    AsyncStorage.setItem('roomCode', roomCode);
    return () => conn.disconnect();
  }, [roomCode]);

  // Countdown ticker for the native overlay
  useEffect(() => {
    if (liveItem?.type === 'countdown') {
      setCountSecs(liveItem.minutes * 60);
      const t = setInterval(() => setCountSecs((v) => (v > 0 ? v - 1 : 0)), 1000);
      return () => clearInterval(t);
    }
  }, [liveItem]);

  // Sync overlay state into the native compositor
  useEffect(() => {
    const nativeLayout = (programLayout || '').replace(/\s+/g, '');
    const state = {
      layout: nativeLayout,
      scripture: liveItem?.type === 'scripture' ? { reference: liveItem.reference, text: liveItem.text } : null,
      lyrics: liveItem?.type === 'hymn' ? { title: liveItem.title, line: liveItem.lines[liveItem.lineIndex || 0] || '', index: liveItem.lineIndex || 0, total: liveItem.lines.length } : null,
      ticker: liveItem?.type === 'ticker' ? { text: liveItem.text, scrollSpeed: 50 } : null,
      lowerThird: liveItem?.type === 'lower' ? { name: liveItem.name, role: liveItem.role } : null,
      countdown: liveItem?.type === 'countdown' ? { secondsLeft: countSecs } : null,
    };
    setOverlayState(state as any).catch(() => {});
  }, [liveItem, programLayout, countSecs]);

  // Start the native publisher only AFTER expo-camera views have unmounted
  useEffect(() => {
    if (!streamMode || !pendingReq || startCalled.current) return;
    startCalled.current = true;
    const req = pendingReq;
    const t = setTimeout(() => {
      startPublishing(req, {
        onConnected: () => setIsLive(true),
        onDisconnected: () => {
          setIsLive(false);
          setStreamMode(false);
          startCalled.current = false;
        },
        onError: (error) => {
          Alert.alert('Stream Error', error);
          setIsLive(false);
          setStreamMode(false);
          startCalled.current = false;
        },
      }).catch((e: any) => {
        Alert.alert('Go Live failed', e?.message ?? String(e));
        setIsLive(false);
        setStreamMode(false);
        startCalled.current = false;
      });
    }, 500);
    return () => clearTimeout(t);
  }, [streamMode, pendingReq]);

  function handleRoomCommand(cmd: RoomCommand) {
    if (cmd.type === 'layout') { setProgramLayout(cmd.layout); }
    else if (cmd.type === 'take') { previousLayout.current = cmd.previousLayout; setProgramLayout(cmd.layout); }
    else if (cmd.type === 'push') { previousLayout.current = cmd.previousLayout; setLiveItem(cmd.item); setProgramLayout(cmd.layout); }
    else if (cmd.type === 'clear') { setLiveItem(null); setProgramLayout(cmd.layout); }
    else if (cmd.type === 'grade') { setGrade(cmd.grade); }
    else if (cmd.type === 'prompter' && liveItem?.type === 'hymn') {
      setLiveItem({ ...liveItem, lineIndex: cmd.lineIndex });
    }
  }

  function pushItem(item: Exclude<LiveItem, null>) {
    const target = layoutForItem(item, programLayout);
    previousLayout.current = programLayout;
    setLiveItem(item.type === 'hymn' ? { ...item, lineIndex: 0 } : item);
    setProgramLayout(target);
    room.current?.publish({ type: 'push', item, layout: target, previousLayout: programLayout });
  }
  function clearItem() {
    const back = previousLayout.current;
    setLiveItem(null);
    setProgramLayout(back);
    room.current?.publish({ type: 'clear', layout: back });
  }
  function takePreview() {
    previousLayout.current = programLayout;
    setProgramLayout(previewLayout);
    room.current?.publish({ type: 'take', layout: previewLayout, previousLayout: programLayout });
  }
  function setLayout(l: Layout) {
    setPreviewLayout(l);
    room.current?.publish({ type: 'layout', layout: l });
  }

  function prompterNext() {
    if (liveItem?.type !== 'hymn') return;
    const nextIdx = Math.min((liveItem.lineIndex || 0) + 1, liveItem.lines.length - 1);
    setLiveItem({ ...liveItem, lineIndex: nextIdx });
    room.current?.publish({ type: 'prompter', lineIndex: nextIdx });
  }
  function prompterPrev() {
    if (liveItem?.type !== 'hymn') return;
    const prevIdx = Math.max((liveItem.lineIndex || 0) - 1, 0);
    setLiveItem({ ...liveItem, lineIndex: prevIdx });
    room.current?.publish({ type: 'prompter', lineIndex: prevIdx });
  }

  async function handleConnectFacebook() {
    try {
      const redirect = Linking.createURL('facebook-auth');
      const token = await connectFacebook(redirect);
      setFbDestinations(await listFacebookDestinations(token));
    } catch (e: any) { Alert.alert('Facebook', e.message); }
  }

  async function handleGoLive() {
    const res = RES_MAP[resolution] || RES_MAP['1080p30'];
    let url = rtmpUrl.trim().replace(/\/$/, '');
    const key = rtmpKey.trim();
    if (key && !url.includes(key)) url = `${url}/${key}`;
    if (!url) {
      Alert.alert('No stream URL', 'Paste your RTMP URL and stream key in Settings first (YouTube, Twitch, Castr, Restream, or Facebook Live Producer).');
      return;
    }
    setPendingReq({ secureStreamUrl: url, width: res.width, height: res.height, videoBitrate: res.videoBitrate });
    setStreamMode(true);
  }

  async function handleStop() {
    try { await stopPublishing(); } catch {}
    startCalled.current = false;
    setPendingReq(null);
    setStreamMode(false);
    setIsLive(false);
  }

  async function saveVerse() {
    if (!verseRef.trim() || !verseText.trim()) return;
    const v = { reference: verseRef.trim(), version: verseVersion, text: verseText.trim() };
    const next = [...savedVerses, v];
    setSavedVerses(next);
    await AsyncStorage.setItem('savedVerses', JSON.stringify(next));
    setVerseRef(''); setVerseText('');
  }
  async function deleteVerse(i: number) {
    const next = savedVerses.filter((_, j) => j !== i);
    setSavedVerses(next);
    await AsyncStorage.setItem('savedVerses', JSON.stringify(next));
  }
  async function fetchVerse() {
    if (!verseRef.trim()) return;
    setFetching(true);
    const result = await fetchBibleVerse(verseRef, verseVersion);
    setFetching(false);
    if (result.found) { setVerseText(result.text); setVerseRef(result.reference); }
    else Alert.alert('Not found', result.text);
  }

  async function saveSong() {
    if (!songTitle.trim() || !songLines.trim()) return;
    const lines = songLines.split('\n').map((l) => l.trim()).filter(Boolean);
    const next = editingSong !== null
      ? songs.map((s, i) => (i === editingSong ? { title: songTitle.trim(), lines } : s))
      : [...songs, { title: songTitle.trim(), lines }];
    setSongs(next);
    await AsyncStorage.setItem('songs', JSON.stringify(next));
    setSongTitle(''); setSongLines(''); setEditingSong(null);
  }
  function editSong(i: number) { setEditingSong(i); setSongTitle(songs[i].title); setSongLines(songs[i].lines.join('\n')); }
  async function deleteSong(i: number) {
    const next = songs.filter((_, j) => j !== i);
    setSongs(next);
    await AsyncStorage.setItem('songs', JSON.stringify(next));
    if (editingSong === i) setEditingSong(null);
  }

  async function saveAnn() {
    if (!annText.trim()) return;
    const next = editingAnn !== null
      ? announcements.map((a, i) => (i === editingAnn ? annText.trim() : a))
      : [...announcements, annText.trim()];
    setAnnouncements(next);
    await AsyncStorage.setItem('announcements', JSON.stringify(next));
    setAnnText(''); setEditingAnn(null);
  }
  function editAnn(i: number) { setEditingAnn(i); setAnnText(announcements[i]); }
  async function deleteAnn(i: number) {
    const next = announcements.filter((_, j) => j !== i);
    setAnnouncements(next);
    await AsyncStorage.setItem('announcements', JSON.stringify(next));
    if (editingAnn === i) setEditingAnn(null);
  }

  async function saveGraphics() {
    await AsyncStorage.setItem('lowerName', lowerName);
    await AsyncStorage.setItem('lowerRole', lowerRole);
    await AsyncStorage.setItem('tickerText', tickerText);
    await AsyncStorage.setItem('countMins', countMins);
    Alert.alert('Saved', 'Graphics settings saved.');
  }

  async function addRundown() {
    if (!rdText.trim()) return;
    const item = { id: Math.random().toString(36).slice(2), text: rdText.trim(), category: rdCat };
    const next = [...rundown, item];
    setRundown(next);
    await AsyncStorage.setItem('rundown', JSON.stringify(next));
    setRdText('');
  }
  function activateRundown(item: RundownItem) {
    setActiveRundown(item.id);
    if (item.category === 'Scripture' || item.category === 'Sermon') {
      pushItem({ type: 'scripture', title: item.text, reference: item.text, version: 'KJV', text: item.text });
    } else if (item.category === 'Praise' || item.category === 'Worship') {
      pushItem({ type: 'hymn', title: item.text, lines: [item.text] });
    } else if (item.category === 'Announce') {
      pushItem({ type: 'announce', title: 'Announcement', text: item.text });
    } else {
      setLayout('Camera Only');
    }
  }
  function nextRundown() {
    const idx = rundown.findIndex((r) => r.id === activeRundown);
    const nextItem = rundown[idx + 1];
    if (nextItem) { clearItem(); setTimeout(() => activateRundown(nextItem), 300); }
    else clearItem();
  }

  const canGoLive = rtmpUrl.trim().length > 0 || !!selectedDest;

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>Light<Text style={s.accent}>Cast</Text></Text>
          <Text style={s.subtitle}>DIRECTOR CONSOLE</Text>
        </View>
        <View style={s.headerRight}>
          <View style={[s.pill, isLive && s.pillLive]}>
            <View style={[s.dot, isLive && s.dotLive]} />
            <Text style={s.pillText}>{isLive ? 'ON AIR' : 'STANDBY'}</Text>
          </View>
        </View>
      </View>

      <View style={s.statusRow}>
        <View style={s.liveChip}>
          <Text style={s.liveChipText}>{liveItem ? `LIVE: ${liveItem.type === 'scripture' ? liveItem.reference : liveItem.type === 'lower' ? liveItem.name : liveItem.type === 'countdown' ? 'Countdown' : liveItem.title ?? liveItem.type}` : 'No live item'}</Text>
          {liveItem ? <TouchableOpacity onPress={clearItem}><Text style={s.clearText}> ✕ Clear</Text></TouchableOpacity> : null}
        </View>
        <Text style={s.roomText}>PAIR: {roomCode} · {roomStatus}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.monitors}>
          <Monitor label="PREVIEW" layout={previewLayout} liveItem={liveItem} grade={grade} pipOn={pipOn} lyricsColor={lyricsColor} hideCam={streamMode} />
          <Monitor label="PROGRAM" layout={programLayout} liveItem={liveItem} grade={grade} pipOn={pipOn} lyricsColor={lyricsColor} live={isLive} camera={!!permission?.granted} nativeCam={streamMode} />
        </View>

        {liveItem?.type === 'hymn' && (
          <View style={s.prompterRow}>
            <TouchableOpacity style={s.prompterBtn} onPress={prompterPrev}><Text style={s.prompterBtnText}>▲ Prev</Text></TouchableOpacity>
            <Text style={s.prompterLabel}>Line {(liveItem.lineIndex || 0) + 1} / {liveItem.lines.length}</Text>
            <TouchableOpacity style={s.prompterBtn} onPress={prompterNext}><Text style={s.prompterBtnText}>Next ▼</Text></TouchableOpacity>
          </View>
        )}

        <View style={s.takeRow}>
          <View>
            <Text style={s.takeLabel}>READY TO TAKE</Text>
            <Text style={s.takeSub}>{previewLayout} → Program</Text>
          </View>
          <View style={s.takeBtns}>
            <TouchableOpacity style={s.takeBtn} onPress={takePreview}><Text style={s.takeBtnText}>TAKE →</Text></TouchableOpacity>
            {!isLive ? (
              <TouchableOpacity style={[s.goBtn, !canGoLive && s.disabled]} onPress={handleGoLive} disabled={!canGoLive}>
                <Text style={s.goBtnText}>Go Live ({resolution})</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.stopBtn} onPress={handleStop}><Text style={s.goBtnText}>Stop</Text></TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chips}>
          {LAYOUTS.map((l) => (
            <TouchableOpacity key={l} style={[s.chip, previewLayout === l && s.chipActive]} onPress={() => setLayout(l)}>
              <Text style={[s.chipText, previewLayout === l && s.chipTextActive]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {fbDestinations.length > 0 && (
          <View style={s.panel}>
            <Text style={s.panelTitle}>STREAM DESTINATION</Text>
            {fbDestinations.map((d) => (
              <TouchableOpacity key={d.id} style={[s.row, selectedDest?.id === d.id && s.rowActive]} onPress={() => setSelectedDest(d)}>
                <Text style={s.rowText}>{d.name} ({d.kind})</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {tab === 'Scenes' && (
          <View style={s.panel}>
            <Text style={s.panelTitle}>OUTPUT SCENES — tap to push on air</Text>
            <View style={s.sceneGrid}>
              {SCENES.map((sc) => (
                <TouchableOpacity key={sc} style={s.sceneCard} onPress={() => {
                  if (sc === 'Camera') setLayout('Camera Only');
                  else if (sc === 'Blank') setLayout('Blank');
                  else if (sc === 'Lyrics') {
                    if (songs[0]) pushItem({ type: 'hymn', title: songs[0].title, lines: songs[0].lines });
                    else Alert.alert('No songs yet', 'Add a song in the Library tab first.');
                  }
                  else if (sc === 'Bible') {
                    if (savedVerses[0]) pushItem({ type: 'scripture', title: savedVerses[0].reference, reference: savedVerses[0].reference, version: savedVerses[0].version, text: savedVerses[0].text });
                    else Alert.alert('No verses yet', 'Save or fetch a verse in the Library tab first.');
                  }
                  else if (sc === 'Lower Third') pushItem({ type: 'lower', name: lowerName, role: lowerRole });
                  else if (sc === 'Ticker') pushItem({ type: 'ticker', text: tickerText });
                  else if (sc === 'Countdown') pushItem({ type: 'countdown', minutes: Math.max(1, parseInt(countMins || '5', 10)) });
                }}>
                  <Text style={s.sceneName}>{sc}</Text>
                  <Text style={s.sceneSub}>Push</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {tab === 'Library' && (
          <View style={s.panel}>
            <Text style={s.panelTitle}>LIBRARY</Text>

            <Text style={s.sub}>Bible Verses (KJV + Yoruba)</Text>
            <TextInput style={s.input} placeholder="Reference (John 3:16)" placeholderTextColor="#666" value={verseRef} onChangeText={setVerseRef} autoCapitalize="none" />
            <View style={s.verRow}>
              <TouchableOpacity style={[s.chip, verseVersion === 'KJV' && s.chipActive]} onPress={() => setVerseVersion('KJV')}><Text style={s.chipText}>KJV</Text></TouchableOpacity>
              <TouchableOpacity style={[s.chip, verseVersion === 'YOR' && s.chipActive]} onPress={() => setVerseVersion('YOR')}><Text style={s.chipText}>YORUBA</Text></TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, fetching && s.disabled]} onPress={fetchVerse} disabled={fetching}>
                <Text style={s.saveBtnText}>{fetching ? 'Fetching…' : '🔍 Fetch Verse'}</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={s.input} placeholder="Verse text (auto-filled by Fetch)" placeholderTextColor="#666" value={verseText} onChangeText={setVerseText} multiline />
            <TouchableOpacity style={s.saveBtn} onPress={saveVerse}><Text style={s.saveBtnText}>+ Save Verse</Text></TouchableOpacity>
            {savedVerses.map((v, i) => (
              <View key={i} style={s.rowFlex}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => pushItem({ type: 'scripture', title: v.reference, reference: v.reference, version: v.version, text: v.text })}>
                  <Text style={s.rowFlexText}>{v.reference} ({v.version})</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.delBtn} onPress={() => deleteVerse(i)}><Text style={s.miniBtnText}>Del</Text></TouchableOpacity>
              </View>
            ))}

            <Text style={s.sub}>Songs / Hymns (Teleprompter) {editingSong !== null ? '(editing)' : ''}</Text>
            <TextInput style={s.input} placeholder="Song title" placeholderTextColor="#666" value={songTitle} onChangeText={setSongTitle} />
            <TextInput style={s.input} placeholder="Lyrics — one line per row" placeholderTextColor="#666" value={songLines} onChangeText={setSongLines} multiline />
            <TouchableOpacity style={s.saveBtn} onPress={saveSong}><Text style={s.saveBtnText}>{editingSong !== null ? '✔ Update Song' : '+ Save Song'}</Text></TouchableOpacity>
            {songs.map((so, i) => (
              <View key={i} style={s.rowFlex}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => pushItem({ type: 'hymn', title: so.title, lines: so.lines })}>
                  <Text style={s.rowFlexText}>{so.title}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.miniBtn} onPress={() => editSong(i)}><Text style={s.miniBtnText}>Edit</Text></TouchableOpacity>
                <TouchableOpacity style={s.delBtn} onPress={() => deleteSong(i)}><Text style={s.miniBtnText}>Del</Text></TouchableOpacity>
              </View>
            ))}

            <Text style={s.sub}>Announcements {editingAnn !== null ? '(editing)' : ''}</Text>
            <TextInput style={s.input} placeholder="Announcement text" placeholderTextColor="#666" value={annText} onChangeText={setAnnText} multiline />
            <TouchableOpacity style={s.saveBtn} onPress={saveAnn}><Text style={s.saveBtnText}>{editingAnn !== null ? '✔ Update' : '+ Save Announcement'}</Text></TouchableOpacity>
            {announcements.map((a, i) => (
              <View key={i} style={s.rowFlex}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => pushItem({ type: 'announce', title: 'Announcement', text: a })}>
                  <Text style={s.rowFlexText}>{a}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.miniBtn} onPress={() => editAnn(i)}><Text style={s.miniBtnText}>Edit</Text></TouchableOpacity>
                <TouchableOpacity style={s.delBtn} onPress={() => deleteAnn(i)}><Text style={s.miniBtnText}>Del</Text></TouchableOpacity>
              </View>
            ))}

            <Text style={s.sub}>Graphics (Lower Third / Ticker / Countdown)</Text>
            <TextInput style={s.input} placeholder="Lower third name" placeholderTextColor="#666" value={lowerName} onChangeText={setLowerName} />
            <TextInput style={s.input} placeholder="Lower third role/title" placeholderTextColor="#666" value={lowerRole} onChangeText={setLowerRole} />
            <TextInput style={s.input} placeholder="Ticker text (slow single-line scroll)" placeholderTextColor="#666" value={tickerText} onChangeText={setTickerText} />
            <TextInput style={s.input} placeholder="Countdown minutes" placeholderTextColor="#666" value={countMins} onChangeText={setCountMins} keyboardType="number-pad" />
            <TouchableOpacity style={s.saveBtn} onPress={saveGraphics}><Text style={s.saveBtnText}>💾 Save Graphics</Text></TouchableOpacity>
          </View>
        )}

        {tab === 'Rundown' && (
          <View style={s.panel}>
            <Text style={s.panelTitle}>RUNDOWN</Text>
            <View style={s.addField}>
              <TextInput style={s.input} placeholder="Item text" placeholderTextColor="#666" value={rdText} onChangeText={setRdText} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity key={c} style={[s.chip, rdCat === c && s.chipActive]} onPress={() => setRdCat(c)}><Text style={s.chipText}>{c}</Text></TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={s.saveBtn} onPress={addRundown}><Text style={s.saveBtnText}>+ Add to Rundown</Text></TouchableOpacity>
            </View>
            {rundown.map((r) => (
              <TouchableOpacity key={r.id} style={[s.row, activeRundown === r.id && s.rowActive]} onPress={() => activateRundown(r)}>
                <Text style={s.rowText}>{r.text} · {r.category}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.nextBtn} onPress={nextRundown}><Text style={s.nextBtnText}>NEXT ▶</Text></TouchableOpacity>
          </View>
        )}

        {tab === 'Settings' && (
          <View style={s.panel}>
            <Text style={s.panelTitle}>SETTINGS</Text>

            <Text style={s.sub}>CUSTOM RTMP (Castr / Restream / YouTube / Twitch / FB Live Producer)</Text>
            <TextInput style={s.input} placeholder="rtmps://live-api-s.facebook.com:443/rtmp/" placeholderTextColor="#666" value={rtmpUrl} onChangeText={(t) => { setRtmpUrl(t); AsyncStorage.setItem('rtmpUrl', t); }} autoCapitalize="none" />
            <TextInput style={s.input} placeholder="Stream key" placeholderTextColor="#666" value={rtmpKey} onChangeText={(t) => { setRtmpKey(t); AsyncStorage.setItem('rtmpKey', t); }} autoCapitalize="none" />

            <View style={s.settingRow}><Text style={s.settingLabel}>Picture-in-Picture</Text><Switch value={pipOn} onValueChange={setPipOn} /></View>
            <View style={s.settingRow}><Text style={s.settingLabel}>Resolution (HD)</Text>
              {(['720p30', '1080p30', '1080p60'] as const).map((r) => (
                <TouchableOpacity key={r} style={[s.chip, resolution === r && s.chipActive]} onPress={() => { setResolution(r); AsyncStorage.setItem('resolution', r); if (isLive) Alert.alert('HD change', 'New resolution applies on the next Go Live. Stop and Go Live again to switch.'); }}><Text style={s.chipText}>{r}</Text></TouchableOpacity>
              ))}
            </View>
            <View style={s.settingRow}><Text style={s.settingLabel}>Grade Preset</Text>
              {GRADE_PRESETS.map((g) => (
                <TouchableOpacity key={g} style={[s.chip, grade.preset === g && s.chipActive]} onPress={() => { const ng = { ...grade, preset: g }; setGrade(ng); room.current?.publish({ type: 'grade', grade: ng }); }}><Text style={s.chipText}>{g}</Text></TouchableOpacity>
              ))}
            </View>
            <Text style={s.note}>Note: HD resolution is applied to the encoder at Go Live. Overlays (scripture, lyrics, ticker, lower third, countdown) are baked into the stream by the native compositor.</Text>
            <View style={s.settingRow}><Text style={s.settingLabel}>Room Code</Text>
              <TextInput style={[s.input, { flex: 1 }]} value={roomCode} onChangeText={setRoomCode} autoCapitalize="characters" />
            </View>
            <TouchableOpacity style={s.stopBtn} onPress={async () => { await disconnectFacebook(); setFbDestinations([]); setSelectedDest(null); }}><Text style={s.goBtnText}>Disconnect Facebook</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <View style={s.nav}>
        {(['Scenes', 'Library', 'Rundown', 'Settings'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={s.navItem} onPress={() => setTab(t)}>
            <Text style={[s.navText, tab === t && s.navTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!permission?.granted && !streamMode && (
        <View style={s.camOverlay}>
          <Text style={s.camText}>Camera permission needed for streaming</Text>
          <TouchableOpacity style={s.goBtn} onPress={requestPermission}><Text style={s.goBtnText}>Grant Camera</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function CountdownBox({ minutes }: { minutes: number }) {
  const [secs, setSecs] = useState(minutes * 60);
  useEffect(() => {
    setSecs(minutes * 60);
    const t = setInterval(() => setSecs((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [minutes]);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return (
    <View style={s.countBox}>
      <Text style={[s.countText, secs <= 10 && { color: '#ef4444' }]}>{mm}:{ss}</Text>
    </View>
  );
}

function ClockBox() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
  const ss = String(time.getSeconds()).padStart(2, '0');
  return (
    <View style={s.clockBox}>
      <Text style={s.clockText}>{hh}:{mm}:{ss}</Text>
    </View>
  );
}

function ScrollingTicker({ text }: { text: string }) {
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const charWidth = 7;
  const totalWidth = text.length * charWidth;

  useEffect(() => {
    scrollAnim.setValue(200);
    const animation = Animated.loop(
      Animated.timing(scrollAnim, {
        toValue: -totalWidth,
        duration: Math.max(8000, text.length * 220),
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [text, totalWidth, scrollAnim]);

  return (
    <View style={s.ticker}>
      <View style={s.newsBlock}><Text style={s.newsText}>NEWS</Text></View>
      <View style={s.tickerScrollArea}>
        <Animated.Text style={[s.tickerText, { transform: [{ translateX: scrollAnim }] }]} numberOfLines={1}>
          {text}
        </Animated.Text>
      </View>
      <ClockBox />
    </View>
  );
}

function Monitor({ label, layout, liveItem, grade, pipOn, lyricsColor, live, camera, nativeCam, hideCam }: any) {
  const showCam = layout !== 'Blank' && camera;
  return (
    <View style={s.monitor}>
      <View style={s.monitorHeader}>
        <Text style={s.monitorLabel}>{label}</Text>
        {live ? <Text style={s.liveTag}>● LIVE</Text> : null}
      </View>
      <View style={s.monitorBody}>
        {nativeCam ? (
          <NativeCompositorView style={StyleSheet.absoluteFill} />
        ) : showCam && !hideCam ? (
          <CameraView style={StyleSheet.absoluteFill} facing="back" />
        ) : (
          <View style={s.blankBg} />
        )}
        {layout === 'Blank' && !nativeCam ? <View style={s.blankBg} /> : null}

        {(layout === 'Sermon' || layout === 'Scripture Full') && liveItem?.type === 'scripture' && (
          <View style={[s.scriptureCard, layout === 'Scripture Full' && s.scriptureFull]}>
            <Text style={s.scriptureRef}>{liveItem.reference} ({liveItem.version})</Text>
            <Text style={s.scriptureText}>{liveItem.text}</Text>
          </View>
        )}

        {(layout === 'Worship' || layout === 'Lyrics Full') && liveItem?.type === 'hymn' && (
          <View style={[s.lyricsBar, { backgroundColor: lyricsColor }]}>
            <Text style={s.lyricsTitle}>{liveItem.title}</Text>
            <Text style={s.lyricsLine} numberOfLines={2}>{liveItem.lines[liveItem.lineIndex || 0]}</Text>
            <Text style={s.lyricsCount}>{(liveItem.lineIndex || 0) + 1}/{liveItem.lines.length}</Text>
          </View>
        )}

        {liveItem?.type === 'announce' && (
          <View style={s.announceCard}>
            <Text style={s.announceTitle}>ANNOUNCEMENT</Text>
            <Text style={s.announceText}>{liveItem.text}</Text>
          </View>
        )}

        {liveItem?.type === 'ticker' && <ScrollingTicker text={liveItem.text} />}

        {liveItem?.type === 'lower' && (
          <View style={s.lowerCard}>
            <Text style={s.lowerName}>{liveItem.name}</Text>
            <Text style={s.lowerRole}>{liveItem.role}</Text>
          </View>
        )}

        {liveItem?.type === 'countdown' && <CountdownBox minutes={liveItem.minutes} />}

        {live && <ClockBox />}

        {pipOn && layout === 'Worship' && <View style={s.pip}><Text style={s.pipLabel}>PASTOR</Text></View>}
      </View>
      <Text style={s.layoutTag}>{layout.toUpperCase()}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d1117' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#161b22', borderBottomWidth: 1, borderBottomColor: '#30363d' },
  title: { fontSize: 22, fontWeight: '800', color: '#fff' },
  accent: { color: '#ff6a00' },
  subtitle: { fontSize: 9, color: '#8b949e', letterSpacing: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#21262d', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  pillLive: { backgroundColor: '#7f1d1d' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#8b949e' },
  dotLive: { backgroundColor: '#ef4444' },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  btn: { backgroundColor: '#1f6feb', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, backgroundColor: '#0d1117' },
  liveChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#21262d', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  liveChipText: { color: '#c9d1d9', fontSize: 11 },
  clearText: { color: '#ef4444', fontSize: 11, fontWeight: '700' },
  roomText: { color: '#8b949e', fontSize: 11 },
  scroll: { padding: 10, paddingBottom: 100 },
  monitors: { flexDirection: 'row', gap: 8 },
  monitor: { flex: 1, backgroundColor: '#161b22', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#30363d' },
  monitorHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 6 },
  monitorLabel: { color: '#8b949e', fontSize: 10, fontWeight: '700' },
  liveTag: { color: '#ef4444', fontSize: 10, fontWeight: '700' },
  monitorBody: { aspectRatio: 16 / 9, backgroundColor: '#000', position: 'relative', overflow: 'hidden' },
  blankBg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  scriptureCard: { position: 'absolute', right: 6, top: 6, bottom: 6, width: '58%', backgroundColor: 'rgba(13,17,23,0.85)', borderRadius: 8, padding: 10, justifyContent: 'center' },
  scriptureFull: { left: 6, width: undefined, right: 6 },
  scriptureRef: { color: '#facc15', fontWeight: '800', fontSize: 13, marginBottom: 6 },
  scriptureText: { color: '#fff', fontWeight: '700', fontSize: 14, textAlign: 'center' },
  lyricsBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 8, paddingHorizontal: 10 },
  lyricsTitle: { color: '#0d1117', fontSize: 9, fontWeight: '700', opacity: 0.7 },
  lyricsLine: { color: '#0d1117', fontWeight: '800', fontSize: 16, textAlign: 'center', lineHeight: 20 },
  lyricsCount: { position: 'absolute', top: 6, right: 8, color: '#0d1117', fontSize: 9, fontWeight: '700', opacity: 0.6 },
  prompterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, backgroundColor: '#161b22', padding: 8, borderRadius: 8 },
  prompterBtn: { backgroundColor: '#ff6a00', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  prompterBtnText: { color: '#0d1117', fontWeight: '800', fontSize: 12 },
  prompterLabel: { color: '#c9d1d9', fontSize: 12, fontWeight: '700' },
  announceCard: { position: 'absolute', left: 10, right: 10, top: '30%', backgroundColor: 'rgba(13,17,23,0.9)', borderRadius: 10, padding: 12, alignItems: 'center' },
  announceTitle: { color: '#ff6a00', fontWeight: '800', fontSize: 10, marginBottom: 4 },
  announceText: { color: '#fff', fontWeight: '700', fontSize: 14, textAlign: 'center' },
  ticker: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: '#000', height: 22, alignItems: 'center' },
  newsBlock: { backgroundColor: '#facc15', paddingHorizontal: 8, height: '100%', justifyContent: 'center' },
  newsText: { color: '#000', fontWeight: '800', fontSize: 10 },
  tickerScrollArea: { flex: 1, overflow: 'hidden', height: '100%', justifyContent: 'center' },
  tickerText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  clockBox: { backgroundColor: '#ef4444', paddingHorizontal: 6, height: '100%', justifyContent: 'center' },
  clockText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  lowerCard: { position: 'absolute', left: 8, bottom: 28, backgroundColor: 'rgba(13,17,23,0.85)', borderLeftWidth: 3, borderLeftColor: '#ff6a00', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 },
  lowerName: { color: '#fff', fontWeight: '800', fontSize: 13 },
  lowerRole: { color: '#facc15', fontSize: 10, fontWeight: '600' },
  countBox: { position: 'absolute', top: 6, left: '40%', width: 80, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, alignItems: 'center', paddingVertical: 4 },
  countText: { color: '#22c55e', fontWeight: '800', fontSize: 20 },
  pip: { position: 'absolute', top: 6, right: 6, width: 60, height: 44, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: '#fff', borderRadius: 4, justifyContent: 'flex-end', alignItems: 'flex-end', padding: 2 },
  pipLabel: { color: '#fff', fontSize: 7, fontWeight: '700' },
  layoutTag: { position: 'absolute', bottom: 4, left: 6, color: '#fff', fontSize: 8, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 4, borderRadius: 3 },
  takeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, backgroundColor: '#161b22', padding: 12, borderRadius: 10 },
  takeLabel: { color: '#8b949e', fontSize: 10, fontWeight: '700' },
  takeSub: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 2 },
  takeBtns: { flexDirection: 'row', gap: 8 },
  takeBtn: { backgroundColor: '#ff6a00', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  takeBtnText: { color: '#0d1117', fontWeight: '800', fontSize: 13 },
  goBtn: { backgroundColor: '#ef4444', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  goBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  stopBtn: { backgroundColor: '#ef4444', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  disabled: { opacity: 0.4 },
  chips: { flexDirection: 'row', marginTop: 10, gap: 6 },
  chip: { backgroundColor: '#21262d', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, marginRight: 6 },
  chipActive: { backgroundColor: '#ff6a00' },
  chipText: { color: '#c9d1d9', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#0d1117' },
  panel: { backgroundColor: '#161b22', borderRadius: 10, padding: 12, marginTop: 12 },
  panelTitle: { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 10 },
  sub: { color: '#8b949e', fontSize: 11, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  note: { color: '#8b949e', fontSize: 10, fontStyle: 'italic', marginTop: 4, marginBottom: 8 },
  row: { backgroundColor: '#21262d', padding: 10, borderRadius: 8, marginBottom: 6 },
  rowActive: { backgroundColor: '#ff6a00' },
  rowText: { color: '#c9d1d9', fontSize: 13 },
  rowFlex: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#21262d', padding: 8, borderRadius: 8, marginBottom: 6 },
  rowFlexText: { color: '#c9d1d9', fontSize: 12 },
  miniBtn: { backgroundColor: '#30363d', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 },
  delBtn: { backgroundColor: '#7f1d1d', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 },
  miniBtnText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  addField: { marginBottom: 8 },
  input: { backgroundColor: '#0d1117', color: '#fff', padding: 10, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: '#30363d' },
  verRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 6 },
  saveBtn: { backgroundColor: '#238636', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginTop: 6, alignSelf: 'flex-start' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  sceneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sceneCard: { width: '30%', backgroundColor: '#21262d', padding: 14, borderRadius: 10, alignItems: 'center' },
  sceneName: { color: '#fff', fontWeight: '700', fontSize: 12 },
  sceneSub: { color: '#8b949e', fontSize: 9, marginTop: 2 },
  nextBtn: { backgroundColor: '#ff6a00', padding: 12, borderRadius: 8, marginTop: 10, alignItems: 'center' },
  nextBtnText: { color: '#0d1117', fontWeight: '800' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  settingLabel: { color: '#c9d1d9', fontSize: 12, width: 110 },
  nav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: '#161b22', borderTopWidth: 1, borderTopColor: '#30363d', paddingBottom: 20 },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  navText: { color: '#8b949e', fontSize: 12, fontWeight: '600' },
  navTextActive: { color: '#ff6a00' },
  camOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', gap: 12 },
  camText: { color: '#fff', fontSize: 14 },
});
