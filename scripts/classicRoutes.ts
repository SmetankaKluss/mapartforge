import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

export function classicPublicRoutes(): Plugin {
  return {
    name: 'mapkluss-classic-public-routes',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (pathname === '/classic-cloud-api.js') {
          request.url = '/src/classicCloudBridge.ts';
          return next();
        }
        if (!/^\/classic(?:\/[a-zA-Z-]+){0,2}\/?$/.test(pathname)) return next();
        const relative = pathname.replace(/^\//, '').replace(/\/$/, '');
        try {
          const html = await readFile(path.join(server.config.publicDir, relative, 'index.html'), 'utf8');
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end(request.method === 'HEAD' ? undefined : html);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return next(error);
          response.statusCode = 404;
          response.end('Classic page not found. Build and stage Classic first.');
        }
      });
    },
  };
}
