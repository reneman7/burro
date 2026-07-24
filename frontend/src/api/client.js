const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    // X-Auth-Token en vez de "Authorization": algunos hostings compartidos
    // (p. ej. IONOS) descartan el header Authorization antes de que llegue a PHP.
    headers['X-Auth-Token'] = token;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`);
  }

  return data;
}

export const api = {
  register: (username, password) =>
    request('/auth/register', { method: 'POST', body: { username, password } }),
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: { username, password } }),
  me: (token) => request('/auth/me', { token }),

  listTables: (token) => request('/tables', { token }),
  createTable: (token, { name, anteValue, buyIn }) =>
    request('/tables', {
      method: 'POST',
      token,
      body: { name, ante_value: anteValue, buy_in: buyIn },
    }),
  joinTable: (token, { code, buyIn }) =>
    request('/tables/join', { method: 'POST', token, body: { code, buy_in: buyIn } }),
  getTable: (token, code) => request(`/tables/${code}`, { token }),
  getManoHistory: (token, code) => request(`/tables/${code}/mano-history`, { token }),
  updateAnte: (token, code, anteValue) =>
    request(`/tables/${code}/ante`, { method: 'PUT', token, body: { ante_value: anteValue } }),
  startPartida: (token, code, mandatoryManos) =>
    request(`/tables/${code}/start`, {
      method: 'POST',
      token,
      body: { mandatory_manos: mandatoryManos },
    }),
  topupTable: (token, code, amount) =>
    request(`/tables/${code}/topup`, { method: 'POST', token, body: { amount } }),
  closeTable: (token, code) => request(`/tables/${code}/close`, { method: 'POST', token }),

  getTransactions: (token) => request('/users/me/transactions', { token }),
  recharge: (token, amount) => request('/users/me/recharge', { method: 'POST', token, body: { amount } }),
};
