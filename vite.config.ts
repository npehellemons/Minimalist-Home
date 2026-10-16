import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';

function appleCalendarProxy(): Plugin {
  const attachProxy = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use('/api/apple-calendar', async (request, response) => {
      try {
        const requestUrl = new URL(request.url ?? '/', 'http://localhost');
        const source = requestUrl.searchParams.get('url');

        if (!source) {
          response.statusCode = 400;
          response.end('Missing calendar URL');
          return;
        }

        const calendarUrl = new URL(source);
        const isAppleCalendar =
          calendarUrl.protocol === 'https:' &&
          (calendarUrl.hostname === 'icloud.com' || calendarUrl.hostname.endsWith('.icloud.com'));

        if (!isAppleCalendar) {
          response.statusCode = 400;
          response.end('Only public iCloud calendar URLs are supported');
          return;
        }

        const calendarResponse = await fetch(calendarUrl, {
          headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8' }
        });

        if (!calendarResponse.ok) {
          response.statusCode = calendarResponse.status;
          response.end('Apple Calendar request failed');
          return;
        }

        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(await calendarResponse.text());
      } catch {
        response.statusCode = 502;
        response.end('Apple Calendar request failed');
      }
    });
  };

  return {
    name: 'apple-calendar-proxy',
    configureServer: attachProxy,
    configurePreviewServer: attachProxy
  };
}

export default defineConfig({
	envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
	build: {
		target: 'chrome106'
	},
	plugins: [
    tailwindcss(),
    appleCalendarProxy(),
    sveltekit({
      adapter: adapter({
        pages: 'build',
        assets: 'build'
      }),
      preprocess: vitePreprocess()
    })
  ],
  server: {
    host: '0.0.0.0',
    watch: {
      ignored: ['**/build/**']
    }
  }
});
