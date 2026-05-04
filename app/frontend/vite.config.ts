import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { viteSourceLocator } from '@metagptx/vite-plugin-source-locator';
import { atoms } from '@metagptx/web-sdk/plugins';
import { vitePrerenderPlugin } from 'vite-prerender-plugin';
import Sitemap from 'vite-plugin-sitemap';
import { getBlogRoutes } from './prerender/blog-routes.js';
import { getSitemapLastmod } from './prerender/blog-sitemap.js';

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Default SEO / social meta for this app (override with VITE_* in .env). */
const SITE_TITLE_DEFAULT = 'X.com Monitoring Tool';
const SITE_DESCRIPTION_DEFAULT =
  'Monitor X (Twitter) creators by category, browse a live feed with virality signals, optionally rewrite in your brand voice, and track AI costs.';
const PREVIOUS_DEFAULT_TITLE = 'personarewire';
const PREVIOUS_DEFAULT_DESC =
  'discover viral posts from creators you monitor on x and linkedin, rewrite them in your brand voice, and track ai costs transparently.';
function normalizeSiteMetaEnv() {
  let title = process.env.VITE_APP_TITLE?.trim();
  let desc = process.env.VITE_APP_DESCRIPTION?.trim();
  if (!title) title = SITE_TITLE_DEFAULT;
  if (!desc) desc = SITE_DESCRIPTION_DEFAULT;
  const tNorm = title.toLowerCase();
  const dNorm = desc.toLowerCase();
  const titleIsTemplate =
    tNorm === 'shadcnui' ||
    tNorm === 'atoms' ||
    tNorm === PREVIOUS_DEFAULT_TITLE ||
    /atoms\s+generated/.test(tNorm) ||
    /x\.com_?content/i.test(title.replace(/\s+/g, ''));
  const descIsTemplate =
    dNorm === 'atoms generated project.' ||
    dNorm === 'atoms generated project' ||
    /^shadcnui$/.test(dNorm) ||
    /x\.com_?content/i.test(desc.replace(/\s+/g, '')) ||
    dNorm === PREVIOUS_DEFAULT_DESC;
  process.env.VITE_APP_TITLE = titleIsTemplate ? SITE_TITLE_DEFAULT : title;
  process.env.VITE_APP_DESCRIPTION = descIsTemplate ? SITE_DESCRIPTION_DEFAULT : desc;
}
normalizeSiteMetaEnv();
process.env.VITE_APP_TITLE = escapeHtmlAttr(process.env.VITE_APP_TITLE);
process.env.VITE_APP_DESCRIPTION = escapeHtmlAttr(process.env.VITE_APP_DESCRIPTION);
const DEFAULT_APP_LOGO = '/x-logo.png';
process.env.VITE_APP_LOGO_URL ??= DEFAULT_APP_LOGO;
// Cursor / MetaGPT often export VITE_APP_LOGO_URL or template URLs pointing at Atoms favicons.
if (
  /metadl\.com|favicon_atoms|atoms\.template|img\/favicon_atoms/i.test(
    process.env.VITE_APP_LOGO_URL || ''
  )
) {
  process.env.VITE_APP_LOGO_URL = DEFAULT_APP_LOGO;
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const blogPrerenderRoutes = command === 'build' ? getBlogRoutes() : [];

  return {
    plugins: [
      viteSourceLocator({
        prefix: 'mgx', // Prefix used to identify source locations; do not change.
      }),
      react(),
      atoms(),
      Sitemap({
        hostname: 'https://atoms.template.com',
        lastmod: getSitemapLastmod(),
        readable: true,
        generateRobotsTxt: true,
      }),
      ...(blogPrerenderRoutes.length > 0
        ? vitePrerenderPlugin({
            renderTarget: '#root',
            prerenderScript: path.resolve(__dirname, 'prerender/blog.js'),
            additionalPrerenderRoutes: blogPrerenderRoutes,
          })
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0', // Listen on all network interfaces.
      port: parseInt(process.env.VITE_PORT || '3000'),
      proxy: {
        '/api': {
          target: `http://localhost:8000`,
          changeOrigin: true,
        },
      },
      watch: { usePolling: true, interval: 600 },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor chunks
            'react-vendor': ['react', 'react-dom'],
            'router-vendor': ['react-router-dom'],
            'ui-vendor': [
              '@radix-ui/react-accordion',
              '@radix-ui/react-alert-dialog',
              '@radix-ui/react-aspect-ratio',
              '@radix-ui/react-avatar',
              '@radix-ui/react-checkbox',
              '@radix-ui/react-collapsible',
              '@radix-ui/react-context-menu',
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-hover-card',
              '@radix-ui/react-label',
              '@radix-ui/react-menubar',
              '@radix-ui/react-navigation-menu',
              '@radix-ui/react-popover',
              '@radix-ui/react-progress',
              '@radix-ui/react-radio-group',
              '@radix-ui/react-scroll-area',
              '@radix-ui/react-select',
              '@radix-ui/react-separator',
              '@radix-ui/react-slider',
              '@radix-ui/react-slot',
              '@radix-ui/react-switch',
              '@radix-ui/react-tabs',
              '@radix-ui/react-toast',
              '@radix-ui/react-toggle',
              '@radix-ui/react-toggle-group',
              '@radix-ui/react-tooltip',
            ],
            'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
            'utils-vendor': [
              'axios',
              'clsx',
              'tailwind-merge',
              'class-variance-authority',
              'date-fns',
              'lucide-react',
            ],
            'query-vendor': ['@tanstack/react-query'],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  };
});
