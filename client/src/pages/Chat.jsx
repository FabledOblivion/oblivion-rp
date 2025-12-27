import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';

function Chat() {
  const { id } = useParams();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const wsRef = useRef(null);

  useEffect(() => {
    async function fetchMessages() {
      try {
        const res = await fetch(`/api/campaigns/${id}/messages`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data || []);
        }
      } catch (err) {
        console.error('Failed to load messages', err);
      }
    }
    fetchMessages();

    const wsUrl = `${window.location.origin.replace('http', 'ws')}/?campaignId=${id}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        setMessages((prev) => [...prev, msg]);
      } catch (err) {
        console.error('Bad message', err);
      }
    };
    wsRef.current = ws;
    return () => {
      ws.close();
    };
  }, [id]);

  const sendMessage = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    if (text.startsWith('/roll')) {
      const expression = text.replace('/roll', '').trim();
      await fetch(`/api/campaigns/${id}/roll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression }),
      });
    } else {
      await fetch(`/api/campaigns/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Campaign Chat</h1>
      <div
        style={{ border: '1px solid #ccc', height: '300px', overflowY: 'auto', marginBottom: '1rem', padding: '0.5rem' }}
      >
        {messages.map((m, index) => (
          <div key={index}>
            {m.type === 'roll'
              ? `[Roll ${m.result}: ${m.expression}]`
              : m.content}
          </div>
        ))}
      </div>
      <form onSubmit={sendMessage} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message or /roll 1d20+5"
          style={{ flex: 1 }}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default Chat;
