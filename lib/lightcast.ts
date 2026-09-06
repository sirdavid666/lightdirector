export type Layout = 'Worship' | 'Sermon' | 'Scripture Full' | 'Lyrics Full' | 'Camera Only' | 'Blank';

export type LiveItem =
  | { type: 'scripture'; title: string; reference: string; version: 'KJV' | 'YOR'; text: string }
  | { type: 'hymn'; title: string; lines: string[] }
  | { type: 'announce'; title: string; text: string }
  | null;

export type GradeSettings = {
  preset: 'Natural' | 'Warm Church' | 'Cool' | 'Cinematic' | 'Vivid' | 'Flat/Log lift';
  exposure: number;
  contrast: number;
  saturation: number;
  warmth: number;
};

export type RoomCommand =
  | { type: 'layout'; layout: Layout }
  | { type: 'take'; layout: Layout; previousLayout: Layout }
  | { type: 'push'; item: Exclude<LiveItem, null>; layout: Layout; previousLayout: Layout }
  | { type: 'clear'; layout: Layout }
  | { type: 'grade'; grade: GradeSettings };

export const defaultGrade: GradeSettings = { preset: 'Warm Church', exposure: 0, contrast: 8, saturation: 6, warmth: 12 };

export function layoutForItem(item: Exclude<LiveItem, null>, current: Layout): Layout {
  return item.type === 'scripture' ? 'Sermon' : item.type === 'hymn' ? 'Worship' : current;
}
