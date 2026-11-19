/* global window, document, localStorage */
// Runs before first paint (loaded without defer) so the saved theme never flashes the wrong one.
(function () {
  var theme;
  try {
    theme = localStorage.getItem('wms-theme') || 'system';
  } catch {
    // Storage blocked: follow the operating system.
    theme = 'system';
  }
  var dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
