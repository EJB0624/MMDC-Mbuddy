const path = require('node:path');
const os = require('node:os');
const { createApp } = require('../server');

// Vercel's bundled source files are read-only. Only its temporary disk is writable.
function createHandler(options) {
  let application;
  return async function handler(req, res) {
    try {
      application ||= createApp(options);
      const app = await application;
      return app(req, res);
    } catch (error) {
      application = null;
      console.error('MBuddy initialization failed:', error);
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ error: 'MBuddy could not start. Please try again later' }));
    }
  };
}

module.exports = createHandler({ dataFile: path.join(os.tmpdir(), 'mbuddy', 'mbuddy.json') });
module.exports.createHandler = createHandler;
