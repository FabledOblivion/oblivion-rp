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
  }, [id]);

  useEffect(() => {
    const protocolWsUrl = window.location.origin.replace(/^http/, 'ws');
    const ws = new WebSocket(`${protocolWsUrl}/?campaignId=${id}`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        // payload is a message object
        setMessages((prev) => [...prev, payload]);
      } catch (err) {
        console.error('WS message parse error', err);
      }
    };
    ws.onclose = () => {
      console.log('WebSocket closed');
    };
    return () => {
      ws.close();
    };
  }, [id]);

  const send = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    try {
      if (text.startsWith('/roll')) {
        const command = text.replace(/^\/roll\s*/, '');
        const res = await fetch(`/api/campaigns/${id}/roll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command }),
        });
        if (!res.ok) {
          alert('Roll failed');
        }
      } else {
        const res = await fetch(`/api/campaigns/${id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });
        if (!res.ok) {
          alert('Send failed');
        }
      }
    } catch (err) {
      console.error('Error sending message', err);
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Campaign Chat</h1>
      <div
        style={{
          maxHeight: '60vh',
          overflowY: 'auto',
          border: '1px solid #ccc',
          padding: '1rem',
          marginBottom: '1rem',
        }}
      >
        {messages.map((msg) => (
          <div key={msg.id ?? Math.random()}>
            {msg.type === 'roll' ? (
              <div>
                <strong>Roll:</strong> {msg.message} {msg.result ? `(Total: ${msg.result.total})` : ''}
              </div>
            ) : (
              <div>{msg.message}</div>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={send}>
        <input
          style={{ width: '80%' }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message or /roll ..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default Chat;
