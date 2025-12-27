const { app, server, db } = require('./server/app');
// Use global fetch available in Node 18
async function runTests() {
  const port = 4000;
  return new Promise((resolve, reject) => {
    const listener = server.listen(port, async () => {
      try {
        // health
        let res = await fetch(`http://localhost:${port}/api/health`);
        if (!res.ok) throw new Error('Health check failed');
        // create campaign
        res = await fetch(`http://localhost:${port}/api/campaigns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Test', description: 'desc', ruleset: '5e2014' })
        });
        if (!res.ok) throw new Error('Create campaign failed');
        const camp = await res.json();
        // join campaign
        res = await fetch(`http://localhost:${port}/api/campaigns/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invite_code: camp.invite_code })
        });
        if (!res.ok) throw new Error('Join failed');
        // send message
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'hello' })
        });
        if (!res.ok) throw new Error('Message failed');
        // roll dice
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/roll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: '1d20+5' })
        });
        if (!res.ok) throw new Error('Roll failed');
        const roll = await res.json();
        if (!roll.result || typeof roll.result.total !== 'number') throw new Error('Invalid roll result');

        // create character
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Hero' })
        });
        if (!res.ok) throw new Error('Create character failed');
        const char = await res.json();
        // get characters list (should include char)
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/characters`);
        const charList = await res.json();
        if (!Array.isArray(charList) || charList.length === 0) throw new Error('Character list empty');
        // get character by id
        res = await fetch(`http://localhost:${port}/api/characters/${char.id}`);
        if (!res.ok) throw new Error('Get character failed');
        const fetchedChar = await res.json();
        if (fetchedChar.id !== char.id) throw new Error('Character fetch mismatch');
        // update character sheet
        const newSheet = { abilities: { str: 12, dex: 13, con: 14, int: 15, wis: 16, cha: 17 } };
        res = await fetch(`http://localhost:${port}/api/characters/${char.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sheet_json: JSON.stringify(newSheet) })
        });
        if (!res.ok) throw new Error('Update character failed');
        const updatedChar = await res.json();
        const updatedSheet = JSON.parse(updatedChar.sheet_json);
        if (!updatedSheet.abilities || updatedSheet.abilities.str !== 12) throw new Error('Character update did not persist');
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