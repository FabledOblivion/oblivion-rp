import React, { useEffect, useState } from 'react';

function Ooc() {
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState('');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Load the last 100 OOC messages
    fetch('/api/ooc/messages', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setMessages(data));
    // Open a WebSocket to the OOC room
    const ws = new WebSocket(
      `${window.location.origin.replace(/^http/, 'ws')}/?campaignId=ooc`
    );
    ws.onopen = () => setConnected(true);
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        // Our server sends { type: 'message', data: msg } for both campaign and OOC messages
        if (data && data.data && data.data.type === 'ooc') {
          setMessages((msgs) => [...msgs, data.data]);
        }
      } catch (e) {
        // ignore invalid JSON
      }
    };
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, []);

  function sendMessage(e) {
    e.preventDefault();
    if (!content) return;
    fetch('/api/ooc/messages', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
      .then((res) => res.json())
      .then(() => {
        setContent('');
      });
  }

  return (
    <div>
      <h1>
        OOC Chat <span>{connected ? '🟢' : '⚪'}</span>
      </h1>
      <ul>
        {messages.map((m, i) => (
          <li key={i}>{m.content}</li>
        ))}
      </ul>
      <form onSubmit={sendMessage} style={{ marginTop: '1rem' }}>
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type a message"
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default Ooc;
