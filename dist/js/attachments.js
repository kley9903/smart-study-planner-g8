// Files stay in this browser's IndexedDB. No uploads or AI processing.
const DB = 'ssp-task-files';
function database() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function request(mode, operation) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('files', mode);
      const req = operation(tx.objectStore('files'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export const saveAttachment = (id, file) => request('readwrite', (store) => store.put(file, id));
export const getAttachment = (id) => request('readonly', (store) => store.get(id));
export const removeAttachment = (id) => request('readwrite', (store) => store.delete(id));
