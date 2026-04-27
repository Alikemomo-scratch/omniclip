import { describe, it, expect } from 'vitest';
import {
  buildPhase1PromptFromConfig,
  normalizeDigestConfig,
  DEFAULT_DIGEST_CONFIG,
  PRESET_TOPICS,
} from '../../src/digest/prompts/digest.prompts';
import type { DigestConfig } from '../../src/digest/prompts/digest.prompts';

describe('buildPhase1PromptFromConfig', () => {
  it('includes selected topic labels in prompt', () => {
    const config: DigestConfig = {
      mode: 'structured',
      selectedTopics: ['ai-ml', 'crypto'],
      customTopics: [],
      headlineCount: 5,
    };
    const prompt = buildPhase1PromptFromConfig(config);
    expect(prompt).toContain('AI / Machine Learning');
    expect(prompt).toContain('Crypto / Web3');
    expect(prompt).not.toContain('Programming');
  });

  it('includes custom topics in prompt', () => {
    const config: DigestConfig = {
      mode: 'structured',
      selectedTopics: [],
      customTopics: ['DeFi Safety', 'ZK Proofs'],
      headlineCount: 3,
    };
    const prompt = buildPhase1PromptFromConfig(config);
    expect(prompt).toContain('DeFi Safety');
    expect(prompt).toContain('ZK Proofs');
  });

  it('includes both preset and custom topics', () => {
    const config: DigestConfig = {
      mode: 'structured',
      selectedTopics: ['ai-ml'],
      customTopics: ['Custom Topic'],
      headlineCount: 5,
    };
    const prompt = buildPhase1PromptFromConfig(config);
    expect(prompt).toContain('AI / Machine Learning');
    expect(prompt).toContain('Custom Topic');
  });

  it('includes headline count in prompt', () => {
    const config: DigestConfig = {
      mode: 'structured',
      selectedTopics: ['ai-ml'],
      customTopics: [],
      headlineCount: 7,
    };
    const prompt = buildPhase1PromptFromConfig(config);
    expect(prompt).toContain('7');
    expect(prompt).toContain('most important items as headlines');
  });

  it('shows no-filter message when no topics selected', () => {
    const config: DigestConfig = {
      mode: 'structured',
      selectedTopics: [],
      customTopics: [],
      headlineCount: 5,
    };
    const prompt = buildPhase1PromptFromConfig(config);
    expect(prompt).toContain('All topics');
  });

  it('includes category and summary instructions', () => {
    const config = normalizeDigestConfig(null);
    const prompt = buildPhase1PromptFromConfig(config);
    expect(prompt).toContain('non-headline');
    expect(prompt).toContain('1–2 sentence summary');
  });
});
