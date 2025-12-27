import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

function CharacterList() {
  const { id } = useParams();
  const [characters, setCharacters] = useState([]);
  const [name, setName] = useState('');

  useEffect(() => {
    fetch(`/api/campaigns/${id}/characters`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setCharacters(data))
      .catch((err) => console.error(err));
  }, [id]);

  const createCharacter = async () => {
    if (!name) return;
    const res = await fetch(`/api/campaigns/${id}/characters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      credentials: 'include',
    });
    if (res.ok) {
      const char = await res.json();
      setCharacters([...characters, char]);
      setName('');
    }
  };

  return (
    <div>
      <h1>Characters</h1>
      <ul>
        {characters.map((c) => (
          <li key={c.id}>
            <Link to={`/characters/${c.id}`}>{c.name}</Link>
          </li>
        ))}
      </ul>
      <div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Character name"
        />
        <button onClick={createCharacter}>Create Character</button>
      </div>
    </div>
  );
}

export default CharacterList;
