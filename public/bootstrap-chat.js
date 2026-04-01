(function () {
  function loadScript(src, next) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = next;
    s.onerror = function () {
      console.error('Chargement échoué:', src);
    };
    document.body.appendChild(s);
  }
  var base = (window.DEVOPS_API_BASE || '').replace(/\/$/, '');
  function withBase(path) {
    if (!base) return path;
    return base + (path.charAt(0) === '/' ? path : '/' + path);
  }
  var socketSrc = withBase('/socket.io/socket.io.js');
  loadScript(socketSrc, function () {
    loadScript(withBase('/config-client.js'), function () {
      loadScript(withBase('/script.js'));
    });
  });
})();
