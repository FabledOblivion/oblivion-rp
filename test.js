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
        if (!res.ok) throw new Error('Create failed');
        const camp = await res.json();
        // join
        res = await fetch(`http://localhost:${port}/api/campaigns/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invite_code: camp.invite_code })
        });
        if (!res.ok) throw new Error('Join failed');
        // message
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'hello' })
        });
        if (!res.ok) throw new Error('Message failed');
        // roll
        res = await fetch(`http://localhost:${port}/api/campaigns/${camp.id}/roll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: '1d20+5' })
        });
        if (!res.ok) throw new Error('Roll failed');
        const roll = await res.json();
        if (!roll.result || typeof roll.result.total !== 'number') throw new Error('Invalid roll result');
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
