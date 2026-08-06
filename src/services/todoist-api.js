const BASE_URL = '/todoist-api';

// Module-level token – populated from page.familySettings on mount
let _token = null;

export function setToken(token) {
  _token = token || null;
}

export function getStoredToken() {
  return _token;
}

export function clearToken() {
  _token = null;
}

async function apiFetch(path, options = {}) {
  const token = getStoredToken();
  if (!token) throw new Error('NOT_AUTHENTICATED');

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401 || res.status === 403) throw new Error('INVALID_TOKEN');
  if (res.status === 410) throw new Error('PROJECT_GONE');
  if (!res.ok) throw new Error(`API_ERROR:${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

export async function getProjects() {
  const data = await apiFetch('/projects');
  return Array.isArray(data) ? data : (data?.results ?? []);
}

export async function getTasks(projectId) {
  const params = new URLSearchParams();
  if (projectId) params.set('project_id', projectId);
  const data = await apiFetch(`/tasks?${params}`);
  return Array.isArray(data) ? data : (data?.results ?? []);
}

export async function getSections(projectId) {
  const params = new URLSearchParams();
  if (projectId) params.set('project_id', projectId);
  const data = await apiFetch(`/sections?${params}`);
  return Array.isArray(data) ? data : (data?.results ?? []);
}

export async function createTask({ content, projectId, sectionId, dueString, dueDate, priority, dueLang = 'nb' }) {
  const body = { content };
  if (projectId) body.project_id = projectId;
  if (sectionId) body.section_id = sectionId;
  if (dueString) {
    body.due_string = dueString;
    body.due_lang = dueLang;
  } else if (dueDate) {
    body.due_date = dueDate;
  }
  if (priority && priority > 1) body.priority = priority;
  return apiFetch('/tasks', { method: 'POST', body: JSON.stringify(body) });
}

export async function closeTask(taskId) {
  return apiFetch(`/tasks/${taskId}/close`, { method: 'POST' });
}

export async function deleteTask(taskId) {
  return apiFetch(`/tasks/${taskId}`, { method: 'DELETE' });
}

export async function updateTask(taskId, updates) {
  return apiFetch(`/tasks/${taskId}`, {
    method: 'POST',
    body: JSON.stringify(updates),
  });
}

export async function createSection(projectId, name) {
  return apiFetch('/sections', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, name }),
  });
}

export async function moveTaskToSection(taskId, sectionId) {
  const token = getStoredToken();
  if (!token) throw new Error('NOT_AUTHENTICATED');
  const commands = [{ type: 'item_move', uuid: `mv-${taskId}-${Date.now()}`, args: { id: String(taskId), section_id: String(sectionId) } }];
  const res = await fetch('/todoist-sync/sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ commands: JSON.stringify(commands) }).toString(),
  });
  if (!res.ok) throw new Error(`SYNC_ERROR:${res.status}`);
  return res.json();
}
