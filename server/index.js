const express = require('express');
const cookieParser = require('cookie-parser');
const { OAuth2Client } = require('google-auth-library');
const Database = require('better-sqlite3');
const WebSocket = require('ws');
const http = require('http');

const app = express();
app.use(express.json());
app.use(cookieParser());

const port = process.env.PORT || 3000;
const devAuth = process.env.DEV_AUTH === 'true';
const clientId = process.env.GOOGLE_CLIENT_ID || '';

// initialize database in data directory
const db = new Database('data/app.sqlite');
db.pragma('journal_mode = WAL');

// Create tables
_db_setup();

function _db_setup() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT,
      ruleset TEXT,
      owner_id TEXT,
      invite_code TEXT
    );
    CREATE TABLE IF NOT EXISTS campaign_members (
      campaign_id TEXT,
      user_id TEXT,
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
      formula TEXT,
      result INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

const oauthClient = new OAuth2Client();

// Middleware to check authentication
function authenticate(req, res, next) {
  if (devAuth) {
    req.user = { id: 'dev', name: 'Dev User', email: 'dev@example.com' };
    return next();
  }
  const sessionCookie = req.cookies.session;
  if (sessionCookie) {
    try {
      req.user = JSON.parse(sessionCookie);
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
    // Bypass for dev or CI
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
  const stmt = db.prepare(
    `SELECT campaigns.id, campaigns.name, campaigns.ruleset, campaigns.owner_id, campaigns.invite_code
     FROM campaigns
     JOIN campaign_members ON campaign_members.campaign_id = campaigns.id
     WHERE campaign_members.user_id = ?`
  );
  const rows = stmt.all(req.user.id);
  res.json(rows);
});

app.post('/api/campaigns', authenticate, (req, res) => {
  const { name, ruleset } = req.body;
  const id = 'camp_' + Date.now().toString(36);
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  db.prepare('INSERT INTO campaigns (id, name, ruleset, owner_id, invite_code) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, ruleset, req.user.id, inviteCode);
  db.prepare('INSERT INTO campaign_members (campaign_id, user_id) VALUES (?, ?)')
    .run(id, req.user.id);
  res.json({ id, name, ruleset, owner_id: req.user.id, invite_code: inviteCode });
});

app.post('/api/campaigns/join', authenticate, (req, res) => {
  const { invite_code } = req.body;
  const campaign = db.prepare('SELECT id FROM campaigns WHERE invite_code = ?').get(invite_code);
  if (!campaign) return res.status(404).json({ error: 'not_found' });
  db.prepare('INSERT OR IGNORE INTO campaign_members (campaign_id, user_id) VALUES (?, ?)')
    .run(campaign.id, req.user.id);
  res.json({ id: campaign.id });
});

app.get('/api/campaigns/:id/messages', authenticate, (req, res) => {
  const { id } = req.params;
  const msgs = db.prepare('SELECT * FROM messages WHERE campaign_id = ? ORDER BY created_at ASC LIMIT 100').all(id);
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

app.post('/api/campaigns/:id/roll', authenticate, (req, res) => {
  const { id } = req.params;
  const { formula } = req.body;
  const result = parseRoll(formula);
  if (result === null) return res.status(400).json({ error: 'invalid_formula' });
  db.prepare('INSERT INTO dice_rolls (campaign_id, user_id, formula, result) VALUES (?, ?, ?, ?)')
    .run(id, req.user.id, formula, result);
  db.prepare('INSERT INTO messages (campaign_id, user_id, content, type) VALUES (?, ?, ?, ?)')
    .run(id, req.user.id, `Rolled ${formula}: ${result}`, 'roll');
  const rollMsg = { formula, result, user_id: req.user.id };
  broadcastToCampaign(id, { type: 'roll', data: rollMsg });
  res.json(rollMsg);
});

function parseRoll(formula) {
  const match = formula.match(/(\d+)d(\d+)([+-]\d+)?/);
  if (!match) return null;
  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total + modifier;
}

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Map of campaignId to set of WebSocket clients
const campaignClients = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/');
  // Expect path like /campaign/{id}
  const campId = parts[2];
  if (!campaignClients.has(campId)) campaignClients.set(campId, new Set());
  campaignClients.get(campId).add(ws);
  ws.on('close', () => {
    const set = campaignClients.get(campId);
    if (set) set.delete(ws);
  });
  ws.on('message', () => {
    // No-op: clients send via REST API
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

server.listen(port, () => {
  console.log(`Server listening on ${port}`);
});
