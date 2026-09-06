import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Switch } from 'react-native';
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
import { startPublishing, stopPublishing } from '@/lib/streamingService';
import * as Linking from 'expo-linking';

const LAYOUTS: Layout[] = ['Worship', 'Sermon', 'Scripture Full', 'Lyrics Full', 'Camera Only', 'Blank'];
const SCENES = ['Camera', 'Bible', 'Lyrics', 'Lower Third', 'Ticker', 'Countdown', 'Blank'] as const;
const CATEGORIES = ['Praise', 'Worship', 'Scripture', 'Sermon', 'Offering', 'Announce', 'Prayer', 'Special', 'Closing'];
const GRADE_PRESETS: GradeSettings['preset'][] = ['Natural', 'Warm Church', 'Cool', 'Cinematic', 'Vivid', 'Flat/Log lift'];

type Tab = 'Scenes' | 'Library' | 'Rundown' | 'Settings';
type RundownItem = { id: string; text: string; category: string };

export default function DirectorConsole() {
  const [permission, requestPermission] = useCameraPermissions();
  const [tab, setTab] = useState<Tab>('Scenes');

  // Program / preview state
  const [programLayout, setProgramLayout] = useState<Layout>('Camera Only');
  const [previewLayout, setPreviewLayout] = useState<Layout>('Worship');
  const [liveItem, setLiveItem] = useState<LiveItem>(null);
  const previousLayout = useRef<Layout>('Camera Only');

  // Streaming state
  const [isLive, setIsLive] = useState(false);
  const [fbDestinations, setFbDestinations] = useState<FacebookDestination[]>([]);
  const [selectedDest, setSelectedDest] = useState<FacebookDestination | null>(null);
  const liveVideoId = useRef<string | null>(null);

  // Room sync
  const [roomCode, setRoomCode] = useState('LIGHT-247');
  const [roomStatus, setRoomStatus] = useState('Not connected');
  const room = useRef<RoomConnection | null>(null);

  // Grade
  const [grade, setGrade] = useState<GradeSettings>(defaultGrade);

  // Library
  const [savedVerses, setSavedVerses] = useState<any[]>([]);
  const [songs, setSongs] = useState<{ title: string; lines: string[] }[]>([]);
  const [announcements, setAnnouncements] = useState<string[]>([]);
  const [verseRef, setVerseRef] = useState('');
  const [verseText, setVerseText] = useState('');
  const [verseVersion, setVerseVersion] = useState<'KJV' | 'YOR'>('KJV');

  // Rundown
  const [rundown, setRundown] = useState<RundownItem[]>([]);
  const [activeRundown, setActiveRundown] = useState<string | null>(null);
  const [rdText, setRdText] = useState('');
  const [rdCat, setRdCat] = useState(CATEGORIES[0]);

  // Settings
  const [pipOn, setPipOn] = useState(true);
  const [resolution, setResolution] = useState('1080p30');
  const [bitrate, setBitrate] = useState('4.5');
  const [lyricsColor, setLyricsColor] = useState('#22c55e');

  // Load persisted data
  useEffect(() => {
    (async () => {
      const token = await getFacebookToken();
      if (token) {
        try { setFbDestinations(await listFacebookDestinations(token)); } catch {}
      }
      const sv = await AsyncStorage.getItem('savedVerses'); if (sv) setSavedVerses(JSON.parse(sv));
      const so = await AsyncStorage.getItem('songs'); if (so) setSongs(JSON.parse(so));
      const an = await AsyncStorage.getItem('announcements'); if (an) setAnnouncements(JSON.parse(an));
      const rd = await AsyncStorage.getItem('rundown'); if (rd) setRundown(JSON.parse(rd));
      const rc = await AsyncStorage.getItem('roomCode'); if (rc) setRoomCode(rc);
    })();
  }, []);

  // Room connection
  useEffect(() => {
    room.current?.disconnect();
    const conn = connectRoom(roomCode, handleRoomCommand, setRoomStatus);
    room.current = conn;
    AsyncStorage.setItem('roomCode', roomCode);
    return () => conn.disconnect();
  }, [roomCode]);

  function handleRoomCommand(cmd: RoomCommand) {
    if (cmd.type === 'layout') { setProgramLayout(cmd.layout); }
    else if (cmd.type === 'take') { previousLayout.current = cmd.previousLayout; setProgramLayout(cmd.layout); }
    else if (cmd.type === 'push') { previousLayout.current = cmd.previousLayout; setLiveItem(cmd.item); setProgramLayout(cmd.layout); }
    else if (cmd.type === 'clear') { setLiveItem(null); setProgramLayout(cmd.layout); }
    else if (cmd.type === 'grade') { setGrade(cmd.grade); }
  }

  // Push / clear with auto-switch + auto-return
  function pushItem(item: Exclude<LiveItem, null>) {
    const target = layoutForItem(item, programLayout);
    previousLayout.current = programLayout;
    setLiveItem(item);
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

  // Facebook
  async function handleConnectFacebook() {
    try {
      const redirect = Linking.createURL('facebook-auth');
      const token = await connectFacebook(redirect);
      setFbDestinations(await listFacebookDestinations(token));
    } catch (e: any) { Alert.alert('Facebook', e.message); }
  }
  async function handleGoLive() {
    if (!selectedDest) { Alert.alert('Pick a destination', 'Connect Facebook and choose a Page or Group first.'); return; }
    try {
      const token = (await getFacebookToken())!;
      const video = await createFacebookLiveVideo(selectedDest);
      liveVideoId.current = video.id;
      await startPublishing({ secureStreamUrl: video.secureStreamUrl, grade });
      setIsLive(true);
    } catch (e: any) { Alert.alert('Go Live failed', e.message); }
  }
  async function handleStop() {
    try {
      await stopPublishing();
      if (liveVideoId.current) {
        const token = (await getFacebookToken())!;
        await endFacebookLiveVideo(liveVideoId.current, token);
      }
    } catch {}
    liveVideoId.current = null;
    setIsLive(false);
  }

  // Library actions
  async function saveVerse() {
    if (!verseRef.trim() || !verseText.trim()) return;
    const v = { reference: verseRef.trim(), version: verseVersion, text: verseText.trim() };
    const next = [...savedVerses, v];
    setSavedVerses(next);
    await AsyncStorage.setItem('savedVerses', JSON.stringify(next));
    setVerseRef(''); setVerseText('');
  }
  async function saveSong(title: string, lines: string[]) {
    const next = [...songs, { title, lines }];
    setSongs(next);
    await AsyncStorage.setItem('songs', JSON.stringify(next));
  }
  async function saveAnnouncement(text: string) {
    const next = [...announcements, text];
    setAnnouncements(next);
    await AsyncStorage.setItem('announcements', JSON.stringify(next));
  }

  // Rundown
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

  const canGoLive = !!selectedDest;

  return (
    <View style={s.root}>
      {/* HEADER */}
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
          <TouchableOpacity style={s.btn} onPress={handleConnectFacebook}>
            <Text style={s.btnText}>{fbDestinations.length ? 'Connected' : 'Connect'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn}><Text style={s.iconBtnText}>⚙</Text></TouchableOpacity>
        </View>
      </View>

      {/* STATUS ROW */}
      <View style={s.statusRow}>
        <View style={s.liveChip}>
          <Text style={s.liveChipText}>{liveItem ? `LIVE: ${liveItem.type === 'scripture' ? liveItem.reference : liveItem.title}` : 'No live item'}</Text>
          {liveItem ? <TouchableOpacity onPress={clearItem}><Text style={s.clearText}> ✕ Clear</Text></TouchableOpacity> : null}
        </View>
        <Text style={s.roomText}>PAIR: {roomCode} · {roomStatus}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* MONITORS */}
        <View style={s.monitors}>
          <Monitor label="PREVIEW" layout={previewLayout} liveItem={liveItem} grade={grade} pipOn={pipOn} lyricsColor={lyricsColor} />
          <Monitor label="PROGRAM" layout={programLayout} liveItem={liveItem} grade={grade} pipOn={pipOn} lyricsColor={lyricsColor} live={isLive} camera={!!permission?.granted} />
        </View>

        {/* TAKE + GO LIVE */}
        <View style={s.takeRow}>
          <View>
            <Text style={s.takeLabel}>READY TO TAKE</Text>
            <Text style={s.takeSub}>{previewLayout} → Program</Text>
          </View>
          <View style={s.takeBtns}>
            <TouchableOpacity style={s.takeBtn} onPress={takePreview}><Text style={s.takeBtnText}>TAKE →</Text></TouchableOpacity>
            {!isLive ? (
              <TouchableOpacity style={[s.goBtn, !canGoLive && s.disabled]} onPress={handleGoLive} disabled={!canGoLive}>
                <Text style={s.goBtnText}>Go Live</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.stopBtn} onPress={handleStop}><Text style={s.goBtnText}>Stop</Text></TouchableOpacity>
            )}
          </View>
        </View>

        {/* LAYOUT CHIPS */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chips}>
          {LAYOUTS.map((l) => (
            <TouchableOpacity key={l} style={[s.chip, previewLayout === l && s.chipActive]} onPress={() => setLayout(l)}>
              <Text style={[s.chipText, previewLayout === l && s.chipTextActive]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* DESTINATION PICKER */}
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

        {/* TAB PANELS */}
        {tab === 'Scenes' && (
          <View style={s.panel}>
            <Text style={s.panelTitle}>OUTPUT SCENES — Choose the next visual</Text>
            <View style={s.sceneGrid}>
              {SCENES.map((sc) => (
                <TouchableOpacity key={sc} style={s.sceneCard} onPress={() => {
                  if (sc === 'Camera') setLayout('Camera Only');
                  else if (sc === 'Blank') setLayout('Blank');
                  else if (sc === 'Lyrics' && songs[0]) pushItem({ type: 'hymn', title: songs[0].title, lines: songs[0].lines });
                  else if (sc === 'Bible' && savedVerses[0]) pushItem({ type: 'scripture', title: savedVerses[0].reference, reference: savedVerses[0].reference, version: savedVerses[0].version, text: savedVerses[0].text });
                }}>
                  <Text style={s.sceneName}>{sc}</Text>
                  <Text style={s.sceneSub}>Queue</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {tab === 'Library' && (
          <View style={s.panel}>
            <Text style={s.panelTitle}>LIBRARY</Text>
            <Text style={s.sub}>Saved Verses</Text>
            {savedVerses.map((v, i) => (
              <TouchableOpacity key={i} style={s.row} onPress={() => pushItem({ type: 'scripture', title: v.reference, reference: v.reference, version: v.version, text: v.text })}>
                <Text style={s.rowText}>{v.reference} ({v.version})</Text>
              </TouchableOpacity>
            ))}
            <View style={s.addField}>
              <TextInput style={s.input} placeholder="Reference (John 3:16)" placeholderTextColor="#666" value={verseRef} onChangeText={setVerseRef} />
              <TextInput style={s.input} placeholder="Verse text" placeholderTextColor="#666" value={verseText} onChangeText={setVerseText} multiline />
              <View style={s.verRow}>
                <TouchableOpacity style={[s.chip, verseVersion === 'KJV' && s.chipActive]} onPress={() => setVerseVersion('KJV')}><Text style={s.chipText}>KJV</Text></TouchableOpacity>
                <TouchableOpacity style={[s.chip, verseVersion === 'YOR' && s.chipActive]} onPress={() => setVerseVersion('YOR')}><Text style={s.chipText}>YOR</Text></TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={saveVerse}><Text style={s.saveBtnText}>+ Save Verse</Text></TouchableOpacity>
              </View>
            </View>
            <Text style={s.sub}>Songs</Text>
            {songs.map((so, i) => (
              <TouchableOpacity key={i} style={s.row} onPress={() => pushItem({ type: 'hymn', title: so.title, lines: so.lines })}>
                <Text style={s.rowText}>{so.title}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.saveBtn} onPress={() => saveSong('New Hymn', ['Great is Thy faithfulness'])}><Text style={s.saveBtnText}>+ Add Song</Text></TouchableOpacity>
            <Text style={s.sub}>Announcements</Text>
            {announcements.map((a, i) => (
              <TouchableOpacity key={i} style={s.row} onPress={() => pushItem({ type: 'announce', title: 'Announcement', text: a })}>
                <Text style={s.rowText}>{a}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.saveBtn} onPress={() => { Alert.prompt ? Alert.prompt('Announcement', '', (t) => t && saveAnnouncement(t)) : saveAnnouncement('Welcome to service'); }}><Text style={s.saveBtnText}>+ Add Announcement</Text></TouchableOpacity>
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
            <View style={s.settingRow}><Text style={s.settingLabel}>Picture-in-Picture</Text><Switch value={pipOn} onValueChange={setPipOn} /></View>
            <View style={s.settingRow}><Text style={s.settingLabel}>Resolution</Text>
              {['720p30', '1080p30', '1080p60'].map((r) => (
                <TouchableOpacity key={r} style={[s.chip, resolution === r && s.chipActive]} onPress={() => setResolution(r)}><Text style={s.chipText}>{r}</Text></TouchableOpacity>
              ))}
            </View>
            <View style={s.settingRow}><Text style={s.settingLabel}>Bitrate (Mbps)</Text>
              {['2.5', '4.5', '6', '8'].map((b) => (
                <TouchableOpacity key={b} style={[s.chip, bitrate === b && s.chipActive]} onPress={() => setBitrate(b)}><Text style={s.chipText}>{b}</Text></TouchableOpacity>
              ))}
            </View>
            <View style={s.settingRow}><Text style={s.settingLabel}>Grade Preset</Text>
              {GRADE_PRESETS.map((g) => (
                <TouchableOpacity key={g} style={[s.chip, grade.preset === g && s.chipActive]} onPress={() => { const ng = { ...grade, preset: g }; setGrade(ng); room.current?.publish({ type: 'grade', grade: ng }); }}><Text style={s.chipText}>{g}</Text></TouchableOpacity>
              ))}
            </View>
            <View style={s.settingRow}><Text style={s.settingLabel}>Room Code</Text>
              <TextInput style={[s.input, { flex: 1 }]} value={roomCode} onChangeText={setRoomCode} autoCapitalize="characters" />
            </View>
            <TouchableOpacity style={s.stopBtn} onPress={async () => { await disconnectFacebook(); setFbDestinations([]); setSelectedDest(null); }}><Text style={s.goBtnText}>Disconnect Facebook</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* BOTTOM NAV */}
      <View style={s.nav}>
        {(['Scenes', 'Library', 'Rundown', 'Settings'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={s.navItem} onPress={() => setTab(t)}>
            <Text style={[s.navText, tab === t && s.navTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!permission?.granted && (
        <View style={s.camOverlay}>
          <Text style={s.camText}>Camera permission needed for streaming</Text>
          <TouchableOpacity style={s.goBtn} onPress={requestPermission}><Text style={s.goBtnText}>Grant Camera</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function Monitor({ label, layout, liveItem, grade, pipOn, lyricsColor, live, camera }: any) {
  const showCam = layout !== 'Blank' && camera;
  return (
    <View style={s.monitor}>
      <View style={s.monitorHeader}>
        <Text style={s.monitorLabel}>{label}</Text>
        {live ? <Text style={s.liveTag}>● LIVE</Text> : null}
      </View>
      <View style={s.monitorBody}>
        {showCam ? <CameraView style={StyleSheet.absoluteFill} facing="back" /> : <View style={s.blankBg} />}
        {layout === 'Blank' ? <View style={s.blankBg} /> : null}

        {/* Scripture card (Sermon / Scripture Full) */}
        {(layout === 'Sermon' || layout === 'Scripture Full') && liveItem?.type === 'scripture' && (
          <View style={[s.scriptureCard, layout === 'Scripture Full' && s.scriptureFull]}>
            <Text style={s.scriptureRef}>{liveItem.reference} ({liveItem.version})</Text>
            <Text style={s.scriptureText}>{liveItem.text}</Text>
          </View>
        )}

        {/* Lyrics bar (Worship / Lyrics Full) */}
        {(layout === 'Worship' || layout === 'Lyrics Full') && liveItem?.type === 'hymn' && (
          <View style={[s.lyricsBar, { backgroundColor: lyricsColor }]}>
            <Text style={s.lyricsText} numberOfLines={2}>{liveItem.lines.join('  •  ')}</Text>
          </View>
        )}

        {/* Announce ticker */}
        {liveItem?.type === 'announce' && (
          <View style={s.ticker}>
            <View style={s.newsBlock}><Text style={s.newsText}>NEWS</Text></View>
            <Text style={s.tickerText} numberOfLines={1}>{liveItem.text}</Text>
          </View>
        )}

        {/* PIP placeholder */}
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
  iconBtn: { backgroundColor: '#21262d', width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { color: '#fff', fontSize: 16 },
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
  lyricsBar: { position: 'absolute', left: 0, right: 0, bottom: 18, padding: 8 },
  lyricsText: { color: '#0d1117', fontWeight: '800', fontSize: 13, textAlign: 'center' },
  ticker: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: '#000', height: 18 },
  newsBlock: { backgroundColor: '#facc15', paddingHorizontal: 8, justifyContent: 'center' },
  newsText: { color: '#000', fontWeight: '800', fontSize: 10 },
  tickerText: { color: '#fff', fontSize: 11, marginLeft: 8, marginTop: 2 },
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
  row: { backgroundColor: '#21262d', padding: 10, borderRadius: 8, marginBottom: 6 },
  rowActive: { backgroundColor: '#ff6a00' },
  rowText: { color: '#c9d1d9', fontSize: 13 },
  addField: { marginBottom: 8 },
  input: { backgroundColor: '#0d1117', color: '#fff', padding: 10, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: '#30363d' },
  verRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
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
