import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

export default function Lobby() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [tables, setTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(true);

  const [name, setName] = useState('');
  const [anteValue, setAnteValue] = useState(1);
  const [buyIn, setBuyIn] = useState(10);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState('');
  const [joinBuyIn, setJoinBuyIn] = useState(10);
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    refreshTables();
  }, []);

  function refreshTables() {
    setLoadingTables(true);
    api
      .listTables(token)
      .then((res) => setTables(res.tables))
      .catch(() => setTables([]))
      .finally(() => setLoadingTables(false));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const table = await api.createTable(token, { name, anteValue: Number(anteValue), buyIn: Number(buyIn) });
      navigate(`/mesa/${table.code}`);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    setJoinError('');
    setJoining(true);
    try {
      await api.joinTable(token, { code: joinCode.trim().toUpperCase(), buyIn: Number(joinBuyIn) });
      navigate(`/mesa/${joinCode.trim().toUpperCase()}`);
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="lobby-page">
      <header>
        <h1>Burro</h1>
        <div>
          <span>
            {user?.username} · {user?.credits} créditos
          </span>
          <button onClick={() => navigate('/cuenta')}>Mi cuenta</button>
          <button onClick={logout}>Salir</button>
        </div>
      </header>
      <main className="lobby-grid">
        <form className="panel" onSubmit={handleCreate}>
          <h2>Crear mesa</h2>
          <label>
            Nombre (opcional)
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mesa de..." />
          </label>
          <label>
            Apuesta inicial
            <input
              type="number"
              min={1}
              value={anteValue}
              onChange={(e) => setAnteValue(e.target.value)}
              required
            />
          </label>
          <label>
            Monto de entrada (fichas para esta mesa)
            <input type="number" min={1} value={buyIn} onChange={(e) => setBuyIn(e.target.value)} required />
          </label>
          {createError && <p className="error">{createError}</p>}
          <button type="submit" disabled={creating}>
            {creating ? 'Creando...' : 'Crear mesa'}
          </button>
        </form>

        <form className="panel" onSubmit={handleJoin}>
          <h2>Unirse a una mesa</h2>
          <label>
            Código de la mesa
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Ej: TAPXCM"
              required
            />
          </label>
          <label>
            Monto de entrada
            <input
              type="number"
              min={1}
              value={joinBuyIn}
              onChange={(e) => setJoinBuyIn(e.target.value)}
              required
            />
          </label>
          {joinError && <p className="error">{joinError}</p>}
          <button type="submit" disabled={joining}>
            {joining ? 'Uniendo...' : 'Unirse'}
          </button>
        </form>

        <div className="panel">
          <h2>Mis mesas</h2>
          {loadingTables && <p>Cargando...</p>}
          {!loadingTables && tables.length === 0 && <p>Todavía no estás en ninguna mesa.</p>}
          <ul className="table-list">
            {tables.map((t) => (
              <li key={t.id}>
                <button className="link-button" onClick={() => navigate(`/mesa/${t.code}`)}>
                  {t.name} · <code>{t.code}</code> · apuesta {t.ante_value} · {t.status}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
