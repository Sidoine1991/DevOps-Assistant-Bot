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

module.exports = { normalizeChromaClientPath };
