import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/hearthstoneclone/' : './',
  server: { open: true }
});
