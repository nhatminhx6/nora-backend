import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const directory = 'postman';
const collectionPath = join(directory, 'Nora.postman_collection.json');

if (!existsSync(collectionPath)) throw new Error(`Missing ${collectionPath}`);

const extraJsonFiles = readdirSync(directory).filter(
  (name) => name.endsWith('.json') && name !== 'Nora.postman_collection.json',
);
if (extraJsonFiles.length > 0) {
  throw new Error(`Postman must be one-file import; remove: ${extraJsonFiles.join(', ')}`);
}

const collection = JSON.parse(readFileSync(collectionPath, 'utf8'));
const variableKeys = (collection.variable ?? []).map((variable) => variable.key);
if (JSON.stringify(variableKeys) !== JSON.stringify(['host', 'token'])) {
  throw new Error(`Collection variables must be exactly host,token; got ${variableKeys.join(',')}`);
}

const requests = [];
function collect(items, folder = '') {
  for (const item of items ?? []) {
    const path = folder ? `${folder} / ${item.name}` : item.name;
    if (item.request) requests.push({ path, request: item.request });
    else collect(item.item, path);
  }
}
collect(collection.item);

const publicPaths = new Set([
  '/health',
  '/health/data-pipeline',
  '/auth/register',
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/users/account',
]);

for (const { path, request } of requests) {
  const rawUrl = typeof request.url === 'string' ? request.url : request.url?.raw ?? '';
  const apiPath = rawUrl.replace('{{host}}', '').split('?')[0];
  const authorizationHeaders = (request.header ?? []).filter(
    (header) => header.key.toLowerCase() === 'authorization' && !header.disabled,
  );
  const isPublic = publicPaths.has(apiPath);
  if (isPublic && authorizationHeaders.length > 0) {
    throw new Error(`${path}: public request must not contain Authorization`);
  }
  if (!isPublic) {
    if (authorizationHeaders.length !== 1) {
      throw new Error(`${path}: protected request needs one visible Authorization header`);
    }
    if (authorizationHeaders[0].value !== 'Bearer {{token}}') {
      throw new Error(`${path}: Authorization must equal Bearer {{token}}`);
    }
  }
}

const login = requests.find(({ request }) => {
  const url = typeof request.url === 'string' ? request.url : request.url?.raw ?? '';
  return url.endsWith('/auth/login');
});
const loginScript = login?.request
  ? (collection.item ?? [])
      .flatMap((folder) => folder.item ?? [])
      .find((item) => item.name === 'Login')
      ?.event?.flatMap((event) => event.script?.exec ?? [])
      .join('\n') ?? ''
  : '';
if (!loginScript.includes("pm.collectionVariables.set('token'")) {
  throw new Error('Login must update the collection token variable');
}

console.log(
  `Postman collection valid: one file, ${requests.length} requests, variables=host,token`,
);

