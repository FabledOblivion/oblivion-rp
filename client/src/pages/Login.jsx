import React from 'react';

function Login() {
  const devLogin = async () => {
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: 'dev' }),
      });
      if (res.ok) {
        window.location.href = '/';
      } else {
        alert('Login failed');
      }
    } catch (err) {
      console.error(err);
      alert('Login error');
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Login</h1>
      {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
        <div>
          <p>Google Sign-In will appear here.</p>
          <div id="gsi-button"></div>
        </div>
      ) : (
        <div>
          <p>DEV auth enabled. Click below to continue.</p>
          <button onClick={devLogin}>Login as DEV</button>
        </div>
      )}
    </div>
  );
}

export default Login;
