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
const saveAttachment = (id, file) => request('readwrite', (store) => store.put(file, id));
export const getAttachment = (id) => request('readonly', (store) => store.get(id));
export const removeAttachment = (id) => request('readwrite', (store) => store.delete(id));

/** 每份檔案的大小上限（MB）：任務附件、自己的課程大綱 */
export const LIMIT_MB = { task: 10, syllabus: 20 };
export const fits = (file, maxMB) => file.size <= maxMB * 1024 * 1024;

/**
 * 把一個檔案存進這個瀏覽器，回傳要登記的 { id, name, size }。
 * 失敗時丟出帶 reason 的錯誤：'too-big'（超過 maxMB，沒有存）或 'storage'（瀏覽器存不進去）。
 */
export async function keepFile(file, maxMB) {
  if (!fits(file, maxMB)) throw Object.assign(new Error(`${file.name} is over ${maxMB} MB`), { reason: 'too-big', maxMB });
  const id = crypto.randomUUID();
  try {
    await saveAttachment(id, file);
  } catch (cause) {
    throw Object.assign(new Error(`Could not store ${file.name}`, { cause }), { reason: 'storage' });
  }
  return { id, name: file.name, size: file.size };
}
