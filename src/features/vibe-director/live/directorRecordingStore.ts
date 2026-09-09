type Chunk = { key: string; takeId: string; sessionId: string; projectId: string; index: number; blob: Blob }
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('synarc-director-recordings', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('chunks', { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await database()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('chunks', mode)
      const request = operation(transaction.objectStore('chunks'))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error ?? new Error('Recording storage was interrupted.'))
    })
  } finally { db.close() }
}
export const storeRecordingChunk = (chunk: Omit<Chunk, 'key'>) => transact('readwrite', store => store.put({ ...chunk, key: `${chunk.takeId}:${chunk.index}` }))
export const recordingChunks = async (projectId: string, sessionId: string) => (await transact<Chunk[]>('readonly', store => store.getAll())).filter(c => c.projectId === projectId && c.sessionId === sessionId).sort((a,b) => a.index-b.index)
export const deleteRecordingChunk = (key: string) => transact('readwrite', store => store.delete(key))
