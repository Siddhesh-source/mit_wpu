import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS=1 serves the dev server over https (self-signed) so phones on the LAN get camera access and offline mode.
export default defineConfig({
  plugins: [react(), ...(process.env.HTTPS ? [basicSsl()] : [])],
  server: { host: true, proxy: { '/api': 'http://localhost:4000' } },
});
