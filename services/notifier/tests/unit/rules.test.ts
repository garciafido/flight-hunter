import { describe, it, expect } from 'vitest';
import { getChannelsForLevel } from '../../src/rules.js';

describe('getChannelsForLevel', () => {
  it('returns [websocket] for info level', () => {
    expect(getChannelsForLevel('info')).toEqual(['websocket']);
  });

  it('returns [websocket, email] for good level', () => {
    expect(getChannelsForLevel('good')).toEqual(['websocket', 'email']);
  });

  it('returns [websocket, email, telegram] for urgent level', () => {
    expect(getChannelsForLevel('urgent')).toEqual(['websocket', 'email', 'telegram']);
  });

  it('returns overrides when provided for any level', () => {
    expect(getChannelsForLevel('urgent', ['telegram'])).toEqual(['telegram']);
    expect(getChannelsForLevel('good', ['websocket'])).toEqual(['websocket']);
    expect(getChannelsForLevel('info', ['email', 'telegram'])).toEqual(['email', 'telegram']);
  });

  it('returns empty array when overrides is empty', () => {
    expect(getChannelsForLevel('urgent', [])).toEqual([]);
  });
});
