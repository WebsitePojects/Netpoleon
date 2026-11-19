// Runs before first paint so the saved theme never flashes the wrong one.
(function () {
  var theme = 'system';
  try {
    theme = localStorage.getItem('wms-theme') || 'system';
  } catch (error) {
    theme = 'system';
  }
  var dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
