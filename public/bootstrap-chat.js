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
  var socketSrc = base ? base + '/socket.io/socket.io.js' : '/socket.io/socket.io.js';
  loadScript(socketSrc, function () {
    loadScript('config-client.js', function () {
      loadScript('script.js');
    });
  });
})();
