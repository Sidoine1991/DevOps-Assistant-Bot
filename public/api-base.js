(function () {
  var raw = typeof window.DEVOPS_API_BASE === 'string' ? window.DEVOPS_API_BASE : '';
  window.DEVOPS_API_BASE = raw.replace(/\/$/, '');

  window.apiUrl = function (path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    var p = path.charAt(0) === '/' ? path : '/' + path;
    return window.DEVOPS_API_BASE + p;
  };
})();
