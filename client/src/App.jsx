import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Home from './pages/Home';
import Chat from './pages/Chat';
import Placeholder from './pages/Placeholder';
import CharacterList from './pages/CharacterList';
import CharacterSheet from './pages/CharacterSheet';
import CampaignSettings from './pages/CampaignSettings';
import Ooc from './pages/Ooc';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Home />} />
      <Route path="/campaign/:id/chat" element={<Chat />} />
      <Route path="/campaign/:id/map" element={<Placeholder name="Map" />} />
      <Route path="/campaign/:id/character" element={<CharacterList />} />
      <Route path="/ooc" element={<Ooc />} />
      <Route path="/campaign/:id/settings" element={<CampaignSettings />} />
      <Route path="/characters/:characterId" element={<CharacterSheet />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
