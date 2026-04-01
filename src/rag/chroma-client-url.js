/**
 * Chroma JS v3 : préférer host / port / ssl à l’option dépréciée `path`.
 */
function parseChromaConnection({ chromaUrl, chromaHost, chromaPort, chromaSsl }) {
  const trimmed = (chromaUrl && String(chromaUrl).trim()) || '';
  if (trimmed) {
    try {
      const u = new URL(trimmed);
      const port = u.port
        ? Number(u.port)
        : (u.protocol === 'https:' ? 443 : 80);
      return {
        host: u.hostname,
        port,
        ssl: u.protocol === 'https:',
      };
    } catch {
      // URL invalide → repli host/port
    }
  }
  return {
    host: chromaHost || '127.0.0.1',
    port: Number(chromaPort ?? 8000),
    ssl: chromaSsl === true || chromaSsl === 'true',
  };
}

function formatChromaConnectionSummary(args) {
  const { host, port, ssl } = args;
  const defaultPort = ssl ? 443 : 80;
  const portPart = port === defaultPort ? '' : `:${port}`;
  return `${ssl ? 'https' : 'http'}://${host}${portPart}`;
}

function connectionKey(args) {
  return `${args.host}:${args.port}:${args.ssl}`;
}

/** @deprecated Utiliser parseChromaConnection + new ChromaClient({ host, port, ssl }) */
function normalizeChromaClientPath(url) {
  if (!url || typeof url !== 'string') return url;
  try {
    const u = new URL(url);
    if (!u.port) {
      u.port = u.protocol === 'https:' ? '443' : '80';
    }
    return u.toString();
  } catch {
    return url;
  }
}

module.exports = {
  parseChromaConnection,
  formatChromaConnectionSummary,
  connectionKey,
  normalizeChromaClientPath,
};
