import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

function Home() {
  const [user, setUser] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ruleset, setRuleset] = useState('5e2014');
  const [joinCode, setJoinCode] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        const meRes = await fetch('/api/me');
        if (meRes.ok) {
          const meData = await meRes.json();
          setUser(meData.user || null);
        }
        const res = await fetch('/api/campaigns');
        if (res.ok) {
          const data = await res.json();
          setCampaigns(data || []);
        }
      } catch (err) {
        console.error('Failed to load campaigns', err);
      }
    }
    fetchData();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, ruleset }),
      });
      if (res.ok) {
        const data = await res.json();
        navigate(`/campaign/${data.id}/chat`);
      } else {
        alert('Create failed');
      }
    } catch (err) {
      console.error(err);
      alert('Error creating campaign');
    }
  };

  const join = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/campaigns/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: joinCode }),
      });
      if (res.ok) {
        const data = await res.json();
        navigate(`/campaign/${data.id}/chat`);
      } else {
        alert('Join failed');
      }
    } catch (err) {
      console.error(err);
      alert('Error joining campaign');
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Your Campaigns</h1>
      {user && <p>Logged in as {user.name}</p>}
      <ul>
        {campaigns.map((c) => (
          <li key={c.id}>
            <Link to={`/campaign/${c.id}/chat`}>{c.name}</Link> – {c.description}
          </li>
        ))}
      </ul>
      <h2>Create Campaign</h2>
      <form onSubmit={create}>
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <br />
        <textarea
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <br />
        <select value={ruleset} onChange={(e) => setRuleset(e.target.value)}>
          <option value="5e2014">5e2014</option>
          <option value="5e2024">5e2024</option>
          <option value="custom">Custom</option>
        </select>
        <br />
        <button type="submit">Create</button>
      </form>
      <h2>Join Campaign</h2>
      <form onSubmit={join}>
        <input
          placeholder="Invite Code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
        />
        <button type="submit">Join</button>
      </form>
    </div>
  );
}

export default Home;
