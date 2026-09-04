import { describe, expect, it } from 'vitest';
import { normalizeUsername, usernameToEmail } from './username';

describe('normalizeUsername', () => {
  it('accepts letters, digits, and underscore', () => {
    expect(normalizeUsername('planner01')).toBe('planner01');
    expect(normalizeUsername('plan_ner_01')).toBe('plan_ner_01');
  });

  it('lowercases the result', () => {
    expect(normalizeUsername('Admin')).toBe('admin');
  });

  it('trims surrounding whitespace before validating', () => {
    expect(normalizeUsername('  admin  ')).toBe('admin');
  });

  it('rejects spaces inside the username', () => {
    expect(normalizeUsername('plan ner')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(normalizeUsername('')).toBeNull();
    expect(normalizeUsername('   ')).toBeNull();
  });

  it('rejects special characters', () => {
    expect(normalizeUsername('admin@123')).toBeNull();
    expect(normalizeUsername('admin!')).toBeNull();
  });

  it('rejects too-short or too-long usernames', () => {
    expect(normalizeUsername('ab')).toBeNull();
    expect(normalizeUsername('a'.repeat(33))).toBeNull();
  });
});

describe('usernameToEmail', () => {
  it('derives a deterministic synthetic email', () => {
    expect(usernameToEmail('admin')).toBe('admin@ki-transfer.local');
  });
});
