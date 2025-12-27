const express = require('express');
const cookieParser = require('cookie-parser');
const { OAuth2Client } = require('google-auth-library');
const Database = require('better-sqlite3');
const WebSocket = require('ws');
const http = require('http');

const app = express();
app.use(express.json());
app.use(cookieParser());
// app.use(require('./routes/characters'));

const port = process.env.PORT || 3000;
const devAuth = process.env.DEV_AUTH === 'true';
const clientId = process.env.GOOGLE_CLIENT_ID || '';

const db = new Database('data/app.sqlite');
db.pragma('journal_mode = WAL');
module.exports.db = db;
app.use(require('./routes/characters'));
// Add settings_json column if not present and mount new routes
try {
  db.exec("ALTER TABLE campaigns ADD COLUMN settings_json TEXT");
} catch (e) {
  // column may already exist
}
app.use(require('./routes/settings'));
app.use(require('./routes/ooc'));

// Create tables
(db.exec(`
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, email TEXT);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  ruleset TEXT,
  owner_id TEXT,
  invite_code TEXT,
  settings_json TEXT
);
CREATE TABLE IF NOT EXISTS campaign_members (
  campaign_id TEXT,
  user_id TEXT,
  role TEXT DEFAULT 'PLAYER',
  PRIMARY KEY (campaign_id, user_id)
);
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  campaign_id TEXT,
  user_id TEXT,
  name TEXT,
  sheet_json TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT,
  user_id TEXT,
  content TEXT,
  type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dice_rolls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT,
  user_id TEXT,
  command TEXT,
  result_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`));

const oauthClient = new OAuth2Client();

function authenticate(req, res, next) {
  if (devAuth) {
    req.user = { id: 'dev', name: 'Dev User', email: 'dev@example.com' };
    return next();
  }
  const sessionCookie = req.cookies.session;
  if (sessionCookie) {
    try {
      const user = JSON.parse(sessionCookie);
      req.user = user;
      return next();
    } catch (e) {
      // invalid cookie
    }
  }
  res.status(401).json({ error: 'unauthenticated' });
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/google', async (req, res) => {
  const { idToken } = req.body;
  if (devAuth) {
    const user = { id: 'dev', name: 'Dev User', email: 'dev@example.com' };
    res.cookie('session', JSON.stringify(user), { httpOnly: true });
    return res.json(user);
  }
  try {
    const ticket = await oauthClient.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();
    const userId = payload.sub;
    const name = payload.name;
    const email = payload.email;
    db.prepare('INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)').run(userId, name, email);
    const user = { id: userId, name, email };
    res.cookie('session', JSON.stringify(user), { httpOnly: true });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: 'invalid_token' });
  }
});

app.get('/api/me', authenticate, (req, res) => {
  res.json(req.user);
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

app.get('/api/campaigns', authenticate, (req, res) => {
  const stmt = db.prepare(`
    SELECT campaigns.id, campaigns.name, campaigns.description, campaigns.ruleset, campaigns.owner_id, campaigns.invite_code,
           (campaigns.owner_id = ?) AS is_owner
    FROM campaigns
    JOIN campaign_members ON campaign_members.campaign_id = campaigns.id
    WHERE campaign_members.user_id = ?
  `);
  const rows = stmt.all(req.user.id, req.user.id);
  res.json(rows);
});

app.post('/api/campaigns', authenticate, (req, res) => {
  const { name, description = '', ruleset = 'custom' } = req.body;
  const id = 'camp_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  db.prepare('INSERT INTO campaigns (id, name, description, ruleset, owner_id, invite_code, settings_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, description, ruleset, req.user.id, inviteCode, '{}');
  db.prepare('INSERT INTO campaign_members (campaign_id, user_id, role) VALUES (?, ?, ?)')
    .run(id, req.user.id, 'GM');
  res.json({ id, name, description, ruleset, owner_id: req.user.id, invite_code: inviteCode });
});

app.post('/api/campaigns/join', authenticate, (req, res) => {
  const { invite_code } = req.body;
  const campaign = db.prepare('SELECT id FROM campaigns WHERE invite_code = ?').get(invite_code);
  if (!campaign) return res.status(404).json({ error: 'not_found' });
  db.prepare('INSERT OR IGNORE INTO campaign_members (campaign_id, user_id, role) VALUES (?, ?, ?)')
    .run(campaign.id, req.user.id, 'PLAYER');
  res.json({ id: campaign.id });
});

app.get('/api/campaigns/:id/messages', authenticate, (req, res) => {
  const { id } = req.params;
  const stmt = db.prepare('SELECT * FROM messages WHERE campaign_id = ? ORDER BY created_at ASC LIMIT 100');
  const msgs = stmt.all(id);
  res.json(msgs);
});

app.post('/api/campaigns/:id/messages', authenticate, (req, res) => {
  const { id } = req.params;
  const { content, type = 'text' } = req.body;
  const insert = db.prepare('INSERT INTO messages (campaign_id, user_id, content, type) VALUES (?, ?, ?, ?)');
  const result = insert.run(id, req.user.id, content, type);
  const msg = {
    id: result.lastInsertRowid,
    campaign_id: id,
    user_id: req.user.id,
    content,
    type,
    created_at: new Date().toISOString(),
  };
  broadcastToCampaign(id, { type: 'message', data: msg });
  res.json(msg);
});

function parseDice(command) {
  const trimmed = command.trim();
  let expr = trimmed;
  if (expr.startsWith('/roll')) {
    expr = expr.slice(5).trim();
  }
  const match = expr.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) return null;
  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;
  const rolls = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }
  const total = rolls.reduce((sum, v) => sum + v, 0) + modifier;
  return { rolls, total, modifier, sides, count };
}

app.post('/api/campaigns/:id/roll', authenticate, (req, res) => {
  const { id } = req.params;
  const { command, formula } = req.body;
  const cmd = command || formula;
  const result = parseDice(cmd);
  if (!result) return res.status(400).json({ error: 'invalid_formula' });
  const resultJson = JSON.stringify(result);
  db.prepare('INSERT INTO dice_rolls (campaign_id, user_id, command, result_json) VALUES (?, ?, ?, ?)')
    .run(id, req.user.id, cmd, resultJson);
  const messageContent = `Rolled ${cmd}: ${result.rolls.join('+')}${result.modifier ? (result.modifier >= 0 ? '+' + result.modifier : result.modifier) : ''} = ${result.total}`;
  db.prepare('INSERT INTO messages (campaign_id, user_id, content, type) VALUES (?, ?, ?, ?)')
    .run(id, req.user.id, messageContent, 'roll');
  const rollMsg = { command: cmd, result };
  broadcastToCampaign(id, { type: 'roll', data: rollMsg });
  res.json(rollMsg);
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const campaignClients = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let campId = url.searchParams.get('campaignId');
  if (!campId) {
    const parts = url.pathname.split('/');
    campId = parts[2] || '';
  }
  if (!campaignClients.has(campId)) {
    campaignClients.set(campId, new Set());
  }
  campaignClients.get(campId).add(ws);
  ws.on('close', () => {
    const set = campaignClients.get(campId);
    if (set) set.delete(ws);
  });
  ws.on('message', () => {
    // clients send via REST
  });
});

function broadcastToCampaign(id, payload) {
  const clients = campaignClients.get(id);
  if (!clients) return;
  const msg = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

if (require.main === module) {
  server.listen(port, () => {
    console.log(`Server listening on ${port}`);
  });
}

module.exports = { app, server, db };
// export broadcaster for routes
module.exports.broadcastToCampaign = broadcastToCampaign;
