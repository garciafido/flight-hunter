import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('manifest.json', () => {
  let manifest: any;

  it('is valid JSON', () => {
    const content = readFileSync(
      join(process.cwd(), 'public/manifest.json'),
      'utf-8',
    );
    expect(() => { manifest = JSON.parse(content); }).not.toThrow();
  });

  it('has required PWA fields', () => {
    const content = readFileSync(
      join(process.cwd(), 'public/manifest.json'),
      'utf-8',
    );
    manifest = JSON.parse(content);
    expect(manifest.name).toBe('Flight Hunter');
    expect(manifest.short_name).toBeDefined();
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('has icons array with 192 and 512 sizes', () => {
    const content = readFileSync(
      join(process.cwd(), 'public/manifest.json'),
      'utf-8',
    );
    manifest = JSON.parse(content);
    expect(Array.isArray(manifest.icons)).toBe(true);
    const sizes = manifest.icons.map((i: any) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('has theme_color and background_color', () => {
    const content = readFileSync(
      join(process.cwd(), 'public/manifest.json'),
      'utf-8',
    );
    manifest = JSON.parse(content);
    expect(manifest.theme_color).toBeDefined();
    expect(manifest.background_color).toBeDefined();
  });
});
