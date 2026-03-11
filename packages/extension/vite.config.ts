import { defineConfig } from 'vite';
import { resolve } from 'path';
import { existsSync } from 'fs';

/**
 * Conditionally include entry points only if the source file exists.
 * This allows incremental development — PR #5 adds parsers/buffer,
 * PR #6 adds content scripts and bridge.
 */
function optionalEntry(name: string, path: string): Record<string, string> {
  const fullPath = resolve(__dirname, path);
  return existsSync(fullPath) ? { [name]: fullPath } : {};
}

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'popup/index': resolve(__dirname, 'src/popup/index.html'),
        // Content scripts and bridge — added as they are implemented
        ...optionalEntry(
          'content/xiaohongshu/interceptor',
          'src/content/xiaohongshu/interceptor.ts',
        ),
        ...optionalEntry('content/twitter/interceptor', 'src/content/twitter/interceptor.ts'),
        ...optionalEntry('bridge/bridge', 'src/bridge/bridge.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
      },
    },
    emptyOutDir: true,
  },
});
