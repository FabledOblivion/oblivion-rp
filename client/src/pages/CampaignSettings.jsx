import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

function CampaignSettings() {
  const { id } = useParams();
  const [invite, setInvite] = useState('');
  const [settingsJson, setSettingsJson] = useState('{}');
  // For MVP we treat user as GM for settings page; server enforces auth
  const [isGM, setIsGM] = useState(true);

  useEffect(() => {
    fetch(`/api/campaigns/${id}/settings`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setInvite(data.invite_code);
        const json = data.settings_json || {};
        // If server returns string, attempt parse for pretty print
        let parsed;
        try {
          parsed = typeof json === 'string' ? JSON.parse(json) : json;
        } catch {
          parsed = json;
        }
        setSettingsJson(JSON.stringify(parsed, null, 2));
      });
  }, [id]);

  function handleSave(e) {
    e.preventDefault();
    fetch(`/api/campaigns/${id}/settings`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings_json: settingsJson }),
    }).then((res) => res.json()).then(() => {
      alert('Settings saved');
    });
  }

  function handleRegenerate() {
    fetch(`/api/campaigns/${id}/invite/regenerate`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        setInvite(data.invite_code);
      });
  }

  return (
    <div>
      <h1>Campaign Settings</h1>
      <p>Invite code: {invite}</p>
      {isGM ? (
        <div>
          <textarea
            value={settingsJson}
            onChange={(e) => setSettingsJson(e.target.value)}
            rows={10}
            cols={60}
          />
          <div>
            <button onClick={handleSave}>Save Settings</button>
            <button onClick={handleRegenerate}>Regenerate Invite</button>
          </div>
        </div>
      ) : (
        <pre>{settingsJson}</pre>
      )}
    </div>
  );
}

export default CampaignSettings;
