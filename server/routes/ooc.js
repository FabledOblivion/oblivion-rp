const express = require('express');
const router = express.Router();

// Pull db and broadcast from app
const { db, broadcastToCampaign } = require('../app');

// Simple auth middleware copied from app.js
const devAuth = process.env.DEV_AUTH === 'true';
function authenticate(req, res, next) {
  if (devAuth) {
    req.user = { id: 'dev', name: 'Dev User', email: 'dev@example.com' };
    return next();
  }
  const sessionCookie = req.cookies && req.cookies.session;
  if (sessionCookie) {
    try {
      const user = JSON.parse(sessionCookie);
      req.user = user;
      return next();
    } catch (err) {}
  }
  return res.status(401).json({ error: 'unauthenticated' });
}

// GET last 100 OOC messages
router.get('/api/ooc/messages', authenticate, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM messages WHERE campaign_id IS NULL AND type = "ooc" ORDER BY created_at ASC LIMIT 100')
    .all();
  res.json(rows);
});

// POST new OOC message
router.post('/api/ooc/messages', authenticate, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content_required' });
  const insert = db.prepare('INSERT INTO messages (campaign_id, user_id, content, type) VALUES (?, ?, ?, ?)');
  const result = insert.run(null, req.user.id, content, 'ooc');
  const msg = {
    id: result.lastInsertRowid,
    campaign_id: null,
    user_id: req.user.id,
    content,
    type: 'ooc',
    created_at: new Date().toISOString(),
  };
  // broadcast to OOC room if broadcast function exists
  if (typeof broadcastToCampaign === 'function') {
    broadcastToCampaign('ooc', { type: 'message', data: msg });
  }
  res.json(msg);
});

module.exports = router;
