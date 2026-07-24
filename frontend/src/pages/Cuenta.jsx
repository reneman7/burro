import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { formatMoney } from '../utils/money';

const TYPE_LABEL = {
  buyin: 'Entrada a mesa',
  cashout: 'Retiro de mesa',
  ante: 'Apuesta de mano',
  penalty: 'Penalización',
  payout: 'Pago recibido',
  admin_adjust: 'Ajuste de admin',
  recharge: 'Recarga',
};

export default function Cuenta() {
  const { user, token, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(50);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function loadTransactions() {
    setLoading(true);
    api
      .getTransactions(token)
      .then((res) => setTransactions(res.transactions))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }

  useEffect(loadTransactions, [token]);

  async function handleRecharge(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.recharge(token, Number(amount));
      await refreshUser();
      loadTransactions();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mesa-page">
      <header>
        <h1>Mi cuenta</h1>
        <button onClick={() => navigate('/')}>Volver al lobby</button>
      </header>

      <p>
        Saldo global: <strong>{formatMoney(user?.credits)} créditos</strong>
      </p>

      <form className="panel" onSubmit={handleRecharge}>
        <h2>Recargar créditos</h2>
        <p className="hint">
          Son fichas virtuales del juego (sin dinero real). Esta autorecarga es temporal mientras no haya panel de
          administrador con límites propios.
        </p>
        <label>
          Monto
          <input
            type="number"
            min={1}
            max={1000}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Recargando...' : 'Recargar'}
        </button>
      </form>

      <h2>Historial de movimientos</h2>
      {loading && <p>Cargando...</p>}
      {!loading && transactions.length === 0 && <p>Todavía no tienes movimientos.</p>}
      {!loading && transactions.length > 0 && (
        <table className="tx-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Mesa</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id}>
                <td>{tx.created_at}</td>
                <td>{TYPE_LABEL[tx.type] ?? tx.type}</td>
                <td>{tx.table_code ?? '-'}</td>
                <td className={tx.amount < 0 ? 'tx-negative' : 'tx-positive'}>
                  {tx.amount > 0 ? '+' : ''}
                  {formatMoney(tx.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
