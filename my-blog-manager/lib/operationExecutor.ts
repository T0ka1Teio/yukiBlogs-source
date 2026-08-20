import type { Operation } from '@/context/OperationContext';

type BackendResult = {
  success: boolean;
  message?: string;
};

async function getBackendBase() {
  const response = await fetch(`/backend_config.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('无法读取本地后端配置');
  const config = await response.json() as { api_port?: number };
  if (!Number.isInteger(config.api_port)) throw new Error('本地后端端口无效');
  return `http://127.0.0.1:${config.api_port}`;
}

function requestFor(operation: Operation, apiBase: string) {
  switch (operation.type) {
    case 'sync_photowall':
      return { url: `${apiBase}/api/gallery/sync`, body: { albums: operation.value } };
    case 'sync_friends':
      return { url: `${apiBase}/api/friends/sync`, body: { friends: operation.value } };
    case 'sync_projects':
      return { url: `${apiBase}/api/projects/sync`, body: { projects: operation.value } };
    case 'CONFIG':
      return { url: `${apiBase}/api/config/update`, body: { updates: operation.payload } };
    case 'create_moment':
      return { url: `${apiBase}/api/moments/save`, body: operation.payload };
    case 'publish_article':
      return { url: `${apiBase}/api/drafts/sync_local`, body: { operations: [operation] } };
  }
}

export async function executeOperation(operation: Operation): Promise<BackendResult> {
  const request = requestFor(operation, await getBackendBase());
  const response = await fetch(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request.body),
  });
  const result = await response.json() as BackendResult;
  if (!response.ok) {
    return { success: false, message: result.message || `HTTP ${response.status}` };
  }
  return result;
}
