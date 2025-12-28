const http = require('http');
const { app, server, db } = require('./server/app');

// Node 18+ has global fetch, but ensure it's available
const fetch = global.fetch || require('node-fetch');

async function runTests() {
  const port = 3456;
  return new Promise((resolve, reject) => {
    const listener = server.listen(port, async () => {
      try {
        // Health check
        let res = await fetch(`http://localhost:${port}/api/health`);
        if (!res.ok) throw new Error('Health check failed');
        const health = await res.json();
        if (health.status !== 'ok') throw new Error('Health status mismatch');

        // Create campaign as dev (GM)
        res = await fetch(`http://localhost:${port}/api/campaigns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Test Campaign', description: 'desc', ruleset: '5e2014' })
        });
        if (!res.ok) throw new Error('Create campaign failed');
        const camp = await res.json();

        // Update settings as GM
        const settingsString = JSON.stringify({ allow_invite_regen: true, theme: 'dark' });
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings_json: settingsString })
        });
        if (!res.ok) throw new Error('GM update settings failed');
        // Get settings
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/settings`);
        const settingsResp = await res.json();
        if (!settingsResp.settings_json || settingsResp.settings_json !== settingsString) throw new Error('Settings retrieval mismatch');

        // Regenerate invite as GM
        const oldInvite = settingsResp.invite_code;
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/invite/regenerate`, {
          method: 'POST'
        });
        if (!res.ok) throw new Error('Invite regen failed');
        const newInvite = (await res.json()).invite_code;
        if (!newInvite || newInvite === oldInvite) throw new Error('Invite did not change');

        // ----- Negative settings/invite tests -----
        // Demote dev user from GM to PLAYER to simulate non-GM
        db.prepare('UPDATE campaign_members SET role = ? WHERE campaign_id = ? AND user_id = ?').run('PLAYER', camp.id, 'dev');

        // Attempt to update settings as non-GM; should fail
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings_json: settingsString })
        });
        if (res.status === 200) throw new Error('Non-GM should not update settings');

        // Attempt to regen invite as non-GM; should fail
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/invite/regenerate`, {
          method: 'POST'
        });
        if (res.status === 200) throw new Error('Non-GM should not regen invite');

        // ----- OOC Chat tests -----
        // Post an OOC message
        res = await fetch(`http://localhost:${port}/api/ooc/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Hello OOC' })
        });
        if (!res.ok) throw new Error('Post OOC failed');
        // Fetch OOC messages; should include our message
        res = await fetch(`http://localhost:${port}/api/ooc/messages`);
        const oocList = await res.json();
        if (!Array.isArray(oocList) || !oocList.find(m => m.content === 'Hello OOC')) throw new Error('OOC message not found');

        // ----- Characters tests -----
        // Create character as dev (GM)
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Test Character' })
        });
        if (!res.ok) throw new Error('Create character failed');
        const character = await res.json();
        const charId = character.id;

        // List characters
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/characters`);
        const chars = await res.json();
        if (!Array.isArray(chars) || !chars.find(c => c.id === charId)) throw new Error('Character not listed');

        // Get character
        res = await fetch(`http://localhost:${port}/api/characters/${charId}`);
        const charData = await res.json();
        if (!charData || charData.name !== 'Test Character') throw new Error('Character fetch mismatch');

        // Update character as owner
        const newSheet = { class: 'Fighter', level: 3, abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } };
        res = await fetch(`http://localhost:${port}/api/characters/${charId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Updated Character', sheet_json: JSON.stringify(newSheet) })
        });
        if (!res.ok) throw new Error('Update character failed');
        // Verify persistence
        res = await fetch(`http://localhost:${port}/api/characters/${charId}`);
        const updatedChar = await res.json();
        if (updatedChar.name !== 'Updated Character') throw new Error('Character name not updated');
        if (typeof updatedChar.sheet_json !== 'string') throw new Error('sheet_json not stored');
        const sheet = JSON.parse(updatedChar.sheet_json);
        if (sheet.class !== 'Fighter' || sheet.abilities.str !== 16) throw new Error('Character sheet not persisted');

        // ----- Characters non-owner update test -----
        // Create other user and membership
        const otherId = 'other_' + Math.random().toString(36).substring(2, 8);
        db.prepare('INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)').run(otherId, 'Other Player', 'other@example.com');
        db.prepare('INSERT OR IGNORE INTO campaign_members (campaign_id, user_id, role) VALUES (?, ?, ?)').run(camp.id, otherId, 'PLAYER');
        // Transfer character ownership to other user
        db.prepare('UPDATE characters SET user_id = ? WHERE id = ?').run(otherId, charId);
        // Demote dev to PLAYER again (ensure not GM)
        db.prepare('UPDATE campaign_members SET role = ? WHERE campaign_id = ? AND user_id = ?').run('PLAYER', camp.id, 'dev');
        // Attempt update as dev (non-owner, non-GM)
        res = await fetch(`http://localhost:${port}/api/characters/${charId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
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

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
