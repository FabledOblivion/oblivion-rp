import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Home from './pages/Home';
import Chat from './pages/Chat';
import Placeholder from './pages/Placeholder';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Home />} />
      <Route path="/campaign/:id/chat" element={<Chat />} />
      <Route path="/campaign/:id/map" element={<Placeholder name="Map" />} />
      <Route path="/campaign/:id/character" element={<Placeholder name="Character" />} />
      <Route path="/ooc" element={<Placeholder name="OOC" />} />
      <Route path="/campaign/:id/settings" element={<Placeholder name="Settings" />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
