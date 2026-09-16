/** Jest config for the vanilla frontend (core modules are DOM-free UMD, so plain Node works). */
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  verbose: false,
  clearMocks: true,
};
