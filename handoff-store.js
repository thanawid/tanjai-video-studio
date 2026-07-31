window.TanjaiVideoMediaStore = window.TanjaiVideoMediaStore || (() => {
  const DB_NAME = 'tanjai-video-media-v1';
  const DB_VERSION = 1;
  const PROJECTS = 'projects';
  const CLIPS = 'clips';

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    });
  }

  async function open() {
    if (!('indexedDB' in window)) throw new Error('เบราว์เซอร์นี้ไม่รองรับคลังคลิปร่วม');
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'projectId' });
      if (!db.objectStoreNames.contains(CLIPS)) {
        const clips = db.createObjectStore(CLIPS, { keyPath: 'key' });
        clips.createIndex('projectId', 'projectId', { unique: false });
      }
    };
    return requestResult(request);
  }

  async function putProject(project) {
    const db = await open();
    const transaction = db.transaction(PROJECTS, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(PROJECTS).put(project);
    await done;
    db.close();
    return project;
  }

  async function putClip(projectId, index, clip) {
    const db = await open();
    const transaction = db.transaction(CLIPS, 'readwrite');
    const done = transactionDone(transaction);
    const record = { ...clip, key: `${projectId}:${String(index).padStart(6, '0')}`, projectId, index };
    transaction.objectStore(CLIPS).put(record);
    await done;
    db.close();
    return { ...record, blob: undefined };
  }

  async function getProject(projectId) {
    const db = await open();
    const transaction = db.transaction(PROJECTS, 'readonly');
    const done = transactionDone(transaction);
    const result = await requestResult(transaction.objectStore(PROJECTS).get(projectId));
    await done;
    db.close();
    return result || null;
  }

  async function getClips(projectId) {
    const db = await open();
    const transaction = db.transaction(CLIPS, 'readonly');
    const done = transactionDone(transaction);
    const index = transaction.objectStore(CLIPS).index('projectId');
    const result = await requestResult(index.getAll(IDBKeyRange.only(projectId)));
    await done;
    db.close();
    return result.sort((a, b) => a.index - b.index);
  }

  async function deleteProject(projectId) {
    const db = await open();
    const transaction = db.transaction([PROJECTS, CLIPS], 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(PROJECTS).delete(projectId);
    const index = transaction.objectStore(CLIPS).index('projectId');
    const cursorRequest = index.openCursor(IDBKeyRange.only(projectId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    await done;
    db.close();
  }

  async function storageStatus(requiredBytes = 0) {
    let quota = 0;
    let usage = 0;
    let persisted = false;
    try {
      const estimate = await navigator.storage?.estimate?.();
      quota = Number(estimate?.quota) || 0;
      usage = Number(estimate?.usage) || 0;
      persisted = await navigator.storage?.persist?.() || await navigator.storage?.persisted?.() || false;
    } catch (_) {}
    return { quota, usage, available: Math.max(0, quota - usage), requiredBytes, persisted };
  }

  return { putProject, putClip, getProject, getClips, deleteProject, storageStatus };
})();
