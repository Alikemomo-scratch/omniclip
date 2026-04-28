import { describe, it, expect } from 'vitest';
import {
  splitPromptTemplate,
  DEFAULT_PHASE1_PROMPT,
  DEFAULT_PHASE2_PROMPT,
} from '../../src/digest/prompts/digest.prompts';

describe('splitPromptTemplate', () => {
  it('splits on ---PHASE_SEPARATOR--- into two phases', () => {
    const template = 'Phase 1 instructions\n---PHASE_SEPARATOR---\nPhase 2 instructions';
    const result = splitPromptTemplate(template);

    expect(result.phase1).toBe('Phase 1 instructions');
    expect(result.phase2).toBe('Phase 2 instructions');
  });

  it('trims whitespace around each phase', () => {
    const template = '  Phase 1 with spaces  \n---PHASE_SEPARATOR---\n  Phase 2 with spaces  ';
    const result = splitPromptTemplate(template);

    expect(result.phase1).toBe('Phase 1 with spaces');
    expect(result.phase2).toBe('Phase 2 with spaces');
  });

  it('uses entire prompt as Phase 1 and default for Phase 2 when no separator', () => {
    const template = 'Only Phase 1 content here';
    const result = splitPromptTemplate(template);

    expect(result.phase1).toBe('Only Phase 1 content here');
    expect(result.phase2).toBe(DEFAULT_PHASE2_PROMPT);
  });

  it('uses defaults for both phases when input is null', () => {
    const result = splitPromptTemplate(null);

    expect(result.phase1).toBe(DEFAULT_PHASE1_PROMPT);
    expect(result.phase2).toBe(DEFAULT_PHASE2_PROMPT);
  });

  it('uses defaults for both phases when input is undefined', () => {
    const result = splitPromptTemplate(undefined);

    expect(result.phase1).toBe(DEFAULT_PHASE1_PROMPT);
    expect(result.phase2).toBe(DEFAULT_PHASE2_PROMPT);
  });

  it('uses defaults for both phases when input is empty string', () => {
    const result = splitPromptTemplate('');

    expect(result.phase1).toBe(DEFAULT_PHASE1_PROMPT);
    expect(result.phase2).toBe(DEFAULT_PHASE2_PROMPT);
  });

  it('uses defaults for both phases when input is whitespace-only', () => {
    const result = splitPromptTemplate('   \n  \t  ');

    expect(result.phase1).toBe(DEFAULT_PHASE1_PROMPT);
    expect(result.phase2).toBe(DEFAULT_PHASE2_PROMPT);
  });

  it('splits on first occurrence only — second separator is part of Phase 2', () => {
    const template = 'Phase 1\n---PHASE_SEPARATOR---\nPhase 2 part A\n---PHASE_SEPARATOR---\nPhase 2 part B';
    const result = splitPromptTemplate(template);

    expect(result.phase1).toBe('Phase 1');
    expect(result.phase2).toBe('Phase 2 part A\n---PHASE_SEPARATOR---\nPhase 2 part B');
  });

  it('uses default Phase 1 when text before separator is empty after trim', () => {
    const template = '   \n---PHASE_SEPARATOR---\nPhase 2 content';
    const result = splitPromptTemplate(template);

    expect(result.phase1).toBe(DEFAULT_PHASE1_PROMPT);
    expect(result.phase2).toBe('Phase 2 content');
  });

  it('uses default Phase 2 when text after separator is empty after trim', () => {
    const template = 'Phase 1 content\n---PHASE_SEPARATOR---\n   ';
    const result = splitPromptTemplate(template);

    expect(result.phase1).toBe('Phase 1 content');
    expect(result.phase2).toBe(DEFAULT_PHASE2_PROMPT);
  });

  it('uses defaults for both when separator exists but both sides are empty', () => {
    const template = '  \n---PHASE_SEPARATOR---\n  ';
    const result = splitPromptTemplate(template);

    expect(result.phase1).toBe(DEFAULT_PHASE1_PROMPT);
    expect(result.phase2).toBe(DEFAULT_PHASE2_PROMPT);
  });
});
