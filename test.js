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
          body: JSON.stringify({ name: 'CharTest', description: 'desc', ruleset: '5e2014' })
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
        // Get settings as member (dev user)
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/settings`);
        const settingsResp = await res.json();
        if (!settingsResp.settings_json || settingsResp.settings_json !== settingsString) throw new Error('Settings retrieval mismatch');
        const oldInvite = settingsResp.invite_code;
        // Regenerate invite as GM
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/invite/regenerate`, { method: 'POST' });
        if (!res.ok) throw new Error('Invite regen failed');
        const newInvite = (await res.json()).invite_code;
        if (!newInvite || newInvite === oldInvite) throw new Error('Invite did not change');
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
        if (!Array.isArray(oocList) || !oocList.find(m => m.content === 'Hello OOC')) throw new Error('OOC message not found');
        // ----- Characters tests -----
        // Insert non-GM user into DB and campaign_members
        const playerId = 'player_' + Math.random().toString(36).substring(2, 8);
        db.prepare('INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)').run(playerId, 'Player One', 'player@example.com');
        db.prepare('INSERT OR IGNORE INTO campaign_members (campaign_id, user_id, role) VALUES (?, ?, ?)').run(camp.id, playerId, 'PLAYER');
        // Construct session cookie for non-GM user
        const sessionCookie = encodeURIComponent(JSON.stringify({ id: playerId, name: 'Player One', email: 'player@example.com' }));
        // Create character as member
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': `session=${sessionCookie}` },
          body: JSON.stringify({ name: 'Test Character' })
        });
        if (!res.ok) throw new Error('Create character failed');
        const character = await res.json();
        const charId = character.id;
        // List characters as member
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/characters`, {
          headers: { 'Cookie': `session=${sessionCookie}` }
        });
        const chars = await res.json();
        if (!Array.isArray(chars) || !chars.find(c => c.id === charId)) throw new Error('Character not listed');
        // Get character as member
        res = await fetch(`http://localhost:${port}/api/characters/${charId}`, {
          headers: { 'Cookie': `session=${sessionCookie}` }
        });
        const charData = await res.json();
        if (!charData || charData.name !== 'Test Character') throw new Error('Character fetch mismatch');
        // Update character as owner
        const newSheet = { class: 'Fighter', level: 3, abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } };
        res = await fetch(`http://localhost:${port}/api/characters/${charId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Cookie': `session=${sessionCookie}` },
          body: JSON.stringify({ name: 'Updated Character', sheet_json: JSON.stringify(newSheet) })
        });
        if (!res.ok) throw new Error('Update character failed');
        // Re-get character and verify persistence
        res = await fetch(`http://localhost:${port}/api/characters/${charId}`, {
          headers: { 'Cookie': `session=${sessionCookie}` }
        });
        const updatedChar = await res.json();
        if (updatedChar.name !== 'Updated Character') throw new Error('Character name not updated');
        if (typeof updatedChar.sheet_json !== 'string') throw new Error('sheet_json not stored');
        const sheet = JSON.parse(updatedChar.sheet_json);
        if (sheet.class !== 'Fighter' || sheet.abilities.str !== 16) throw new Error('Character sheet not persisted');
        // Authorization test: ensure non-owner cannot update
        const otherId = 'other_' + Math.random().toString(36).substring(2, 8);
        db.prepare('INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)').run(otherId, 'Other Player', 'other@example.com');
        db.prepare('INSERT OR IGNORE INTO campaign_members (campaign_id, user_id, role) VALUES (?, ?, ?)').run(camp.id, otherId, 'PLAYER');
        const otherCookie = encodeURIComponent(JSON.stringify({ id: otherId, name: 'Other Player', email: 'other@example.com' }));
        res = await fetch(`http://localhost:${port}/api/characters/${charId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Cookie': `session=${otherCookie}` },
          body: JSON.stringify({ name: 'Hacker', sheet_json: '{}' })
        });
        if (res.status === 200) throw new Error('Non-owner should not update character');
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
