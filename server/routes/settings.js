const express = require('express');
const router = express.Router();

// Pull database from app.js. db will be available because app.js assigns module.exports.db before requiring this router.
const { db } = require('../app');

// Simple auth middleware copied from app.js.
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
    } catch (err) {
      // fall through to unauthenticated
    }
  }
  return res.status(401).json({ error: 'unauthenticated' });
}

// Helper to check membership role
function getMembership(campaignId, userId) {
  return db
    .prepare('SELECT role FROM campaign_members WHERE campaign_id = ? AND user_id = ?')
    .get(campaignId, userId);
}

function isGM(campaignId, userId) {
  const membership = getMembership(campaignId, userId);
  return membership && membership.role === 'GM';
}

// GET campaign settings and invite code
router.get('/api/campaigns/:id/settings', authenticate, (req, res) => {
  const campaignId = req.params.id;
  const membership = getMembership(campaignId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'forbidden' });
  const camp = db
    .prepare('SELECT settings_json, invite_code FROM campaigns WHERE id = ?')
    .get(campaignId);
  if (!camp) return res.status(404).json({ error: 'not_found' });
  res.json({ settings_json: camp.settings_json || '{}', invite_code: camp.invite_code });
});

// PUT update campaign settings (GM only)
router.put('/api/campaigns/:id/settings', authenticate, (req, res) => {
  const campaignId = req.params.id;
  const membership = getMembership(campaignId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'forbidden' });
  if (!isGM(campaignId, req.user.id)) return res.status(403).json({ error: 'forbidden' });
  const { settings_json } = req.body;
  if (typeof settings_json !== 'string') {
    return res.status(400).json({ error: 'invalid_settings' });
  }
  db.prepare('UPDATE campaigns SET settings_json = ? WHERE id = ?').run(settings_json, campaignId);
  res.json({ ok: true });
});

// POST regenerate invite code (GM only)
router.post('/api/campaigns/:id/invite/regenerate', authenticate, (req, res) => {
  const campaignId = req.params.id;
  if (!isGM(campaignId, req.user.id)) return res.status(403).json({ error: 'forbidden' });
  // Read settings to respect allow_invite_regen if present
  const camp = db
    .prepare('SELECT settings_json FROM campaigns WHERE id = ?')
    .get(campaignId);
  if (!camp) return res.status(404).json({ error: 'not_found' });
  let settings = {};
  if (camp.settings_json) {
    try {
      settings = JSON.parse(camp.settings_json);
    } catch (e) {
      settings = {};
    }
  }
  if (settings.allow_invite_regen === false) {
    return res.status(400).json({ error: 'invite_regen_disabled' });
  }
  const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  db.prepare('UPDATE campaigns SET invite_code = ? WHERE id = ?').run(newCode, campaignId);
  res.json({ invite_code: newCode });
});

module.exports = router;
