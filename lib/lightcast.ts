export type Layout = 'Worship' | 'Sermon' | 'Scripture Full' | 'Lyrics Full' | 'Camera Only' | 'Blank';

export type ScriptureItem = { type: 'scripture'; title: string; reference: string; version: 'KJV' | 'YOR'; text: string };
export type HymnItem = { type: 'hymn'; title: string; lines: string[]; lineIndex?: number };
export type AnnounceItem = { type: 'announce'; title: string; text: string };
export type TickerItem = { type: 'ticker'; text: string };
export type LowerItem = { type: 'lower'; name: string; role: string };
export type CountdownItem = { type: 'countdown'; minutes: number };
export type LiveItem = ScriptureItem | HymnItem | AnnounceItem | TickerItem | LowerItem | CountdownItem | null;

export type GradeSettings = { preset: string; exposure: number; contrast: number; saturation: number; warmth: number; fade: number };
export const defaultGrade: GradeSettings = { preset: 'Natural', exposure: 0, contrast: 0, saturation: 0, warmth: 0, fade: 0 };

export type RoomCommand =
  | { type: 'layout'; layout: Layout }
  | { type: 'take'; layout: Layout; previousLayout: Layout }
  | { type: 'push'; item: Exclude<LiveItem, null>; layout: Layout; previousLayout: Layout }
  | { type: 'clear'; layout: Layout }
  | { type: 'grade'; grade: GradeSettings }
  | { type: 'prompter'; lineIndex: number };

export function layoutForItem(item: Exclude<LiveItem, null>, current: Layout): Layout {
  if (item.type === 'scripture') return current === 'Lyrics Full' ? 'Scripture Full' : 'Sermon';
  if (item.type === 'hymn') return current === 'Scripture Full' ? 'Lyrics Full' : 'Worship';
  return current === 'Blank' ? 'Camera Only' : current;
}
