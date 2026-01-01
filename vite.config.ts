import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'fnmap',
      fileName: 'index',
      formats: ['cjs']
    },
    rollupOptions: {
      external: [
        'fs',
        'path',
        'child_process',
        '@babel/parser',
        '@babel/traverse',
        '@babel/generator',
        '@babel/types',
        'commander',
        'prettier'
      ]
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    isolate: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'dist/',
        '*.config.ts'
      ]
    }
  }
});
