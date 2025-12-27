const express = require('express');
const router = express.Router();
const { db } = require('../app');

// Authentication middleware copied from app.js. Uses DEV_AUTH for CI bypass.
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
      // fall through
    }
  }
  res.status(401).json({ error: 'unauthenticated' });
}

// helper to check membership and role
function getMembership(campaignId, userId) {
  return db
    .prepare('SELECT role FROM campaign_members WHERE campaign_id = ? AND user_id = ?')
    .get(campaignId, userId);
}

function isGM(campaignId, userId) {
  const membership = getMembership(campaignId, userId);
  return membership && membership.role === 'GM';
}

function characterTemplate(name) {
  return {
    name,
    class: '',
    level: 1,
    race: '',
    background: '',
    abilities: {
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    },
    skills: {},
    saves: {},
    hp: 0,
    ac: 0,
    speed: 0,
    initiative: 0,
    attacks: [],
    spells: [],
    equipment: [],
  };
}

// Route: list characters in a campaign
router.get('/api/campaigns/:id/characters', authenticate, (req, res) => {
  const campaignId = req.params.id;
  const membership = getMembership(campaignId, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'forbidden' });
  }
  let rows;
  if (membership.role === 'GM') {
    rows = db.prepare('SELECT * FROM characters WHERE campaign_id = ?').all(campaignId);
  } else {
    rows = db
      .prepare('SELECT * FROM characters WHERE campaign_id = ? AND user_id = ?')
      .all(campaignId, req.user.id);
  }
  res.json(rows);
});

// Route: create character
router.post('/api/campaigns/:id/characters', authenticate, (req, res) => {
  const campaignId = req.params.id;
  const membership = getMembership(campaignId, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name_required' });
  const campaign = db.prepare('SELECT ruleset FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'not_found' });
  // create default sheet
  const sheet = characterTemplate(name);
  const sheetJson = JSON.stringify(sheet);
  const id = 'char_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  db.prepare('INSERT INTO characters (id, campaign_id, user_id, name, sheet_json) VALUES (?, ?, ?, ?, ?)')
    .run(id, campaignId, req.user.id, name, sheetJson);
  res.json({ id, campaign_id: campaignId, user_id: req.user.id, name, sheet_json: sheetJson });
});

// Route: get character
router.get('/api/characters/:characterId', authenticate, (req, res) => {
  const charId = req.params.characterId;
  const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(charId);
  if (!char) return res.status(404).json({ error: 'not_found' });
  const membership = getMembership(char.campaign_id, req.user.id);
  if (!membership) return res.status(403).json({ error: 'forbidden' });
  res.json(char);
});

// Route: update character
router.put('/api/characters/:characterId', authenticate, (req, res) => {
  const charId = req.params.characterId;
  const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(charId);
  if (!char) return res.status(404).json({ error: 'not_found' });
  const membership = getMembership(char.campaign_id, req.user.id);
  const gm = isGM(char.campaign_id, req.user.id);
  if (!membership || (char.user_id !== req.user.id && !gm)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { name, sheet_json } = req.body;
  if (sheet_json && sheet_json.length > 200 * 1024) {
    return res.status(400).json({ error: 'sheet_too_large' });
  }
  const newName = name || char.name;
  const newSheet = sheet_json || char.sheet_json;
  db.prepare('UPDATE characters SET name = ?, sheet_json = ? WHERE id = ?').run(newName, newSheet, charId);
  const updated = db.prepare('SELECT * FROM characters WHERE id = ?').get(charId);
  res.json(updated);
});

module.exports = router;
