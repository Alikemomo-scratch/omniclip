import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';

import { DigestService } from './digest.service';

function createService(config: Record<string, string | undefined>) {
  const configService = {
    get: vi.fn((key: string) => config[key]),
  } as unknown as ConfigService;

  const service = new DigestService({} as any, configService, {} as any);

  return { service: service as any, configService };
}

describe('DigestService AI provider configuration', () => {
  it('does not initialize OpenAI when the API key is a placeholder', () => {
    const { service } = createService({
      'openai.apiKey': 'sk-your-openai-api-key',
      'gemini.apiKey': '',
    });

    expect(service.openai).toBeNull();
  });

  it('uses configured model names for AI providers', () => {
    const { service } = createService({
      'openai.apiKey': '',
      'openai.model': 'gpt-test-model',
      'gemini.apiKey': 'AIzaSyAValidLookingGeminiKeyForTests123',
      'gemini.model': 'gemini-test-model',
    });

    expect(service.openaiModel).toBe('gpt-test-model');
    expect(service.geminiModel).toBe('gemini-test-model');
  });
});
