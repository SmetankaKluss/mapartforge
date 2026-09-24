// The standalone GPL build remains usable without the MapKluss host application.
// On mapkluss.art this path is served by the site's authenticated Cloud bridge.
window.MapKlussClassicCloud = {
  getClassicCloudAccount: async () => null,
  saveClassicToCloud: async () => { throw new Error('Cloud is available on mapkluss.art.'); },
};
