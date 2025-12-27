import React from 'react';
import { Link } from 'react-router-dom';

export default function Placeholder({ name }) {
  return (
    <div style={{ padding: '1rem' }}>
      <h1>{name} Page</h1>
      <p>This feature is coming soon.</p>
      <Link to="/">Back to Home</Link>
    </div>
  );
}
