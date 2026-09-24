# MapKluss Classic

Classic is a separately built GPL-3.0-only MapartCraft fork, served as static files
from public/classic. Its own build does not import Studio's React runtime.
On the MapKluss site, Classic dynamically loads the same-origin
`/classic-cloud-api.js` bridge, built from this MIT repository, to use the
existing authenticated Companion Cloud save flow. The bridge source is
`src/classicCloudBridge.ts` and its imported `src/lib/` modules in this repo;
the staging step includes the bridge's complete source tree, lockfile, license,
dependency notices and a standalone Vite build recipe in the same Classic
source ZIP, under mapkluss-cloud-bridge/. Every site build refreshes that part
from the current checkout so it cannot silently lag behind the shipped bridge.
The standalone fork has a disabled Cloud stub.

The MIT license at this repository root does NOT relicense public/classic.
Classic code: rebane2001 and contributors, MapKluss modifications copyright 2026
SmetankaKluss. See public/classic/LICENSE.txt and THIRD-PARTY-NOTICES.txt.

Upstream: https://github.com/rebane2001/mapartcraft
Revision: 0f24df5d7a913f978bdd4738de95bc11461d497e
Local fork workspace: C:/Projects/mapkluss-classic
Integration branch: codex/mapkluss-classic

## Updating the standalone distribution

1. In the fork, run `npm ci`, `npm run build`, `npm test`.
2. In this repo, run `npm run classic:stage -- C:/Projects/mapkluss-classic/dist`.
3. Review STAGED-FILES.json hashes and the source archive; include all staged
   files in the release. Build scripts never require the sibling workspace.
4. Run site build and browser checks: /, /classic/, /classic/ru/, FAQ, image
   upload, NBT/map.dat, MapKluss 2D/3D Litematic, Two-layer ZIP and source ZIP.
   Check `/classic-cloud-api.js` from the final site build, account detection,
   private save and reopening the saved art in the main editor. Never use a
   production account for automated fixture saves without explicit consent.
   Preview in a desktop browser and
   a narrow viewport. Static language/FAQ indexes permit direct refreshes.
5. Before production approval, check the served host response for security
   headers (Content-Security-Policy, X-Content-Type-Options, Referrer-Policy,
   and frame restrictions). These belong to the external gateway/CDN, not this
   static bundle; the local preview cannot establish their production state.

The corresponding source archive includes source, resources, lockfile, build
scripts and tests. Extract, run npm ci and npm run build to reproduce the app.
Keep that archive and licenses alongside the browser bundle when publishing.
Main CI deploys the checked-in build; it must not silently substitute Studio's
index.html for Classic routes.

The legacy NBT selector retains the upstream Minecraft list through 1.20.
The separately selected MapKluss 2D/3D and Two-layer exports target current
Java versions and use the ported MapKluss palette/processing engine. A signed-in
user can save those methods to the existing private Companion Cloud. The saved
v4 project contains one editable converted-pixel layer and opens in the main
editor/Companion; it does not preserve Classic's source-image reprocessing.
Legacy NBT/map.dat settings do not Cloud-save. Classic does not reopen arbitrary
multi-layer Cloud projects or add Lens/brushes. Client limits are 16 maps per
side, 64 total, and input images up to 10 MB / 16 million decoded pixels.
