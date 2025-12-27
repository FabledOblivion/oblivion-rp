import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

function CharacterSheet() {
  const { characterId } = useParams();
  const [character, setCharacter] = useState(null);
  const [abilities, setAbilities] = useState({
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  });

  useEffect(() => {
    fetch(`/api/characters/${characterId}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setCharacter(data);
        try {
          const sheet = JSON.parse(data.sheet_json || '{}');
          if (sheet.abilities) setAbilities(sheet.abilities);
        } catch (e) {
          // ignore
        }
      })
      .catch((err) => console.error(err));
  }, [characterId]);

  const handleChange = (field, value) => {
    setAbilities({ ...abilities, [field]: value });
  };

  const save = async () => {
    if (!character) return;
    let sheet;
    try {
      sheet = character.sheet_json ? JSON.parse(character.sheet_json) : {};
    } catch (e) {
      sheet = {};
    }
    sheet.abilities = abilities;
    const res = await fetch(`/api/characters/${characterId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: character.name, sheet_json: JSON.stringify(sheet) }),
      credentials: 'include',
    });
    if (res.ok) {
      const updated = await res.json();
      setCharacter(updated);
    }
  };

  if (!character) return <div>Loading...</div>;

  return (
    <div>
      <h1>{character.name}</h1>
      <div>
        {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((stat) => (
          <div key={stat}>
            <label>
              {stat.toUpperCase()}: 
              <input
                type="number"
                value={abilities[stat]}
                onChange={(e) => handleChange(stat, parseInt(e.target.value, 10))}
              />
            </label>
          </div>
        ))}
      </div>
      <button onClick={save}>Save</button>
    </div>
  );
}

export default CharacterSheet;
