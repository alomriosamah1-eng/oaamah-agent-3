// Orb gallery + voice-config tests — pure Node-safe. The gallery registry is
// plain data (imports no Skia), so this suite exercises style resolution and
// the `orbStyle` persistence whitelist exactly as the app runs them.
//
// Run: npx tsc --noEmit  then node on the compiled .test-dist/tests output.

import { makeSuite, assert } from './helpers';
import {
  ORB_STYLES,
  DEFAULT_GALLERY_STYLE,
  resolveOrbStyle,
  isGalleryStyle,
} from '../utils/orbs/gallery/registry';
import { DEFAULT_VOICE_CONFIG, normalizeVoiceConfig } from '../utils/voice/config';

export async function runSuite(): Promise<void> {
  const suite = makeSuite('orb-gallery-config');

  suite.test('registry exposes exactly the 15 curated designs', () => {
    assert(Array.isArray(ORB_STYLES), 'ORB_STYLES is an array');
    assert(ORB_STYLES.length === 15, `expected 15 styles, got ${ORB_STYLES.length}`);
    const ids = new Set(ORB_STYLES.map((o) => o.id));
    assert(ids.size === 15, 'ids are unique');
    for (const o of ORB_STYLES) {
      assert(typeof o.name === 'string' && o.name.length > 0, `name for ${o.id}`);
      assert(/^#[0-9a-fA-F]{6}$/.test(o.colorFrom), `colorFrom hex for ${o.id}`);
      assert(/^#[0-9a-fA-F]{6}$/.test(o.colorTo), `colorTo hex for ${o.id}`);
    }
  });

  suite.test('default style is pulse and resolves for any input', () => {
    assert(DEFAULT_GALLERY_STYLE === 'pulse', 'DEFAULT_GALLERY_STYLE is pulse');
    const def = resolveOrbStyle(undefined);
    assert(def.id === 'pulse', 'resolveOrbStyle(undefined) falls back to pulse');
    const bad = resolveOrbStyle('nope');
    assert(bad.id === 'pulse', 'unknown id falls back to pulse');
    for (const o of ORB_STYLES) {
      const hit = resolveOrbStyle(o.id);
      assert(hit.id === o.id, `resolveOrbStyle resolves ${o.id}`);
    }
  });

  suite.test('isGalleryStyle only accepts curated ids', () => {
    assert(isGalleryStyle('pulse'), 'pulse is a gallery style');
    assert(isGalleryStyle('galaxy'), 'galaxy is a gallery style');
    assert(!isGalleryStyle('shell'), 'the dotted shell is NOT in the gallery');
    assert(!isGalleryStyle(undefined), 'undefined is not a style');
    assert(!isGalleryStyle(''), 'empty string is not a style');
    assert(!isGalleryStyle('not-a-style'), 'random string is not a style');
  });

  suite.test('default config carries the gallery default', () => {
    assert(DEFAULT_VOICE_CONFIG.orbStyle === 'pulse', 'default orbStyle is pulse');
  });

  suite.test('normalizeVoiceConfig preserves a valid orbStyle', () => {
    const cfg = normalizeVoiceConfig({ orbStyle: 'nebula' });
    assert(cfg.orbStyle === 'nebula', 'valid style survives normalize');
    assert(cfg.locale === 'ar-SY', 'rest of config keeps defaults');
  });

  suite.test('normalizeVoiceConfig rejects unknown styles', () => {
    const cfg = normalizeVoiceConfig({ orbStyle: 'shell' });
    assert(cfg.orbStyle === 'pulse', 'unknown style falls back to default');
    const junk = normalizeVoiceConfig({ orbStyle: 42 });
    assert(junk.orbStyle === 'pulse', 'non-string style falls back to default');
    const none = normalizeVoiceConfig(null);
    assert(none.orbStyle === 'pulse', 'null payload falls back to default');
  });

  suite.test('every registry id passes the config whitelist', () => {
    for (const o of ORB_STYLES) {
      const cfg = normalizeVoiceConfig({ orbStyle: o.id });
      assert(cfg.orbStyle === o.id, `whitelist accepts ${o.id}`);
    }
  });

  await suite.report();
}