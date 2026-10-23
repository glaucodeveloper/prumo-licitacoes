// PDF.js 6.4 uses Map.prototype.getOrInsertComputed, which is missing in
// Chromium versions shipped by some Electron installations.
if (typeof Map.prototype.getOrInsertComputed !== 'function') {
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    configurable: true,
    writable: true,
    value(key, callback) {
      if (typeof callback !== 'function') {
        throw new TypeError('Map.prototype.getOrInsertComputed callback must be callable');
      }
      if (Map.prototype.has.call(this, key)) return Map.prototype.get.call(this, key);
      const value = callback(key);
      if (Map.prototype.has.call(this, key)) {
        Map.prototype.set.call(this, key, value);
        return value;
      }
      Map.prototype.set.call(this, key, value);
      return value;
    },
  });
}
