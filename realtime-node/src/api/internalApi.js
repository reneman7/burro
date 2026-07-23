const BASE_URL = process.env.INTERNAL_API_URL;
const INTERNAL_KEY = process.env.INTERNAL_API_KEY;

/**
 * Cliente para la API interna de PHP. Reemplaza el acceso directo a MySQL:
 * en producción, la base de datos de la mesa solo es alcanzable desde la
 * propia red de hosting de IONOS, así que Node le pide a PHP (que sí puede
 * llegar a la base de datos) que lea/escriba por él.
 */
async function call(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Key': INTERNAL_KEY,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Internal API ${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export const internalApi = {
  get: (path) => call('GET', path),
  post: (path, body) => call('POST', path, body),
};
