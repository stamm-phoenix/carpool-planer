// @ts-check
import { defineConfig, envField } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'static',
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
