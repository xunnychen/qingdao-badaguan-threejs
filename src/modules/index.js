// Feature-module registry (core-owned). Load order = update order. Each entry file is owned by exactly one package.
import * as player from './player.js';
import * as sky from './sky.js';
import * as terrain from './terrain.js';
import * as coast from './coast.js';
import * as villas from './villas.js';
import * as landmarks from './landmarks.js';
import * as streetscape from './streetscape.js';
import * as trees from './trees.js';
import * as life from './life.js';
import * as post from './post.js';
import * as audio from './audio.js';
import * as ui from './ui.js';

export const MODULES = { player, sky, terrain, coast, villas, landmarks, streetscape, trees, life, post, audio, ui };
export const ORDER = ['player', 'sky', 'terrain', 'coast', 'villas', 'landmarks', 'streetscape', 'trees', 'life', 'post', 'audio', 'ui'];
export const LABELS = {
  player: '步履', sky: '天光', terrain: '地勢與街道', coast: '海與礁石', villas: '紅瓦別墅', landmarks: '花石樓 · 公主樓',
  streetscape: '石牆與街燈', trees: '行道樹', life: '花葉與海鷗', post: '光影', audio: '潮聲', ui: '導覽',
};
