// @ts-check
import { defineConfig, envField } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone'
  }),
  server: {
    host: true
  },
  env: {
    schema: {
      CAMPFLOW_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true })
    }
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
