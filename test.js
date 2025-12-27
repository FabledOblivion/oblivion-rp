const { app, server, db } = require('./server/app');

// Node 18 has global fetch
async function runTests() {
  const port = 4000;
  return new Promise((resolve, reject) => {
    const listener = server.listen(port, async () => {
      try {
        // Health check
        let res = await fetch(`http://localhost:${port}/api/health`);
        if (!res.ok) throw new Error('Health check failed');
        // Create campaign as GM (dev user)
        res = await fetch(`http://localhost:${port}/api/campaigns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'SettingsTest', description: 'desc', ruleset: '5e2014' })
        });
        if (!res.ok) throw new Error('Create campaign failed');
        const camp = await res.json();
        // Put settings as GM
        const settingsString = JSON.stringify({ allow_invite_regen: true, notes: 'Hello' });
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings_json: settingsString })
        });
        if (!res.ok) throw new Error('GM update settings failed');
        // Get settings as member
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/settings`);
        const settingsResp = await res.json();
        if (!settingsResp.settings_json || settingsResp.settings_json !== settingsString) throw new Error('Settings retrieval mismatch');
        const oldInvite = settingsResp.invite_code;
        // Regenerate invite as GM
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/invite/regenerate`, { method: 'POST' });
        if (!res.ok) throw new Error('Invite regen failed');
        const newInvite = (await res.json()).invite_code;
        if (!newInvite || newInvite === oldInvite) throw new Error('Invite did not change');
        // Insert non-GM user into DB and campaign_members
        const playerId = 'player_' + Math.random().toString(36).substring(2,8);
        db.prepare('INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)').run(playerId, 'Player One', 'player@example.com');
        db.prepare('INSERT OR IGNORE INTO campaign_members (campaign_id, user_id, role) VALUES (?, ?, ?)').run(camp.id, playerId, 'PLAYER');
        // Construct session cookie for non-GM user
        const sessionCookie = encodeURIComponent(JSON.stringify({ id: playerId, name: 'Player One', email: 'player@example.com' }));
        // Attempt to update settings as non-GM; should return forbidden (403)
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Cookie': `session=${sessionCookie}` },
          body: JSON.stringify({ settings_json: settingsString })
        });
        if (res.status === 200) throw new Error('Non-GM should not update settings');
        // Attempt to regen invite as non-GM; should fail
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/invite/regenerate`, {
          method: 'POST',
          headers: { 'Cookie': `session=${sessionCookie}` }
        });
        if (res.status === 200) throw new Error('Non-GM should not regen invite');
        // OOC: post message
        res = await fetch(`http://localhost:${port}/api/ooc/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Hello OOC' })
        });
        if (!res.ok) throw new Error('OOC post failed');
        const msg = await res.json();
        if (!msg.content || msg.content !== 'Hello OOC') throw new Error('OOC post content mismatch');
        // OOC: fetch messages, should include our message
        res = await fetch(`http://localhost:${port}/api/ooc/messages`);
        const oocList = await res.json();
        if (!Array.isArray(oocList) || oocList.length === 0) throw new Error('OOC messages empty');
        const found = oocList.find(m => m.content === 'Hello OOC');
        if (!found) throw new Error('OOC message not found');
        console.log('All tests passed');
        listener.close(() => resolve());
      } catch (err) {
        console.error(err);
        listener.close(() => reject(err));
      }
    });
  });
}

runTests().catch(() => process.exit(1));
