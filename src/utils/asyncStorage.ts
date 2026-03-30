import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
  deleteAsync,
} from 'expo-file-system/legacy';

const STORE_DIR = `${documentDirectory}store/`;

async function ensureDir() {
  const info = await getInfoAsync(STORE_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(STORE_DIR, { intermediates: true });
  }
}

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      await ensureDir();
      const path = `${STORE_DIR}${key}.json`;
      const info = await getInfoAsync(path);
      if (!info.exists) return null;
      return await readAsStringAsync(path);
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    await ensureDir();
    const path = `${STORE_DIR}${key}.json`;
    await writeAsStringAsync(path, value);
  },

  async removeItem(key: string): Promise<void> {
    try {
      const path = `${STORE_DIR}${key}.json`;
      await deleteAsync(path, { idempotent: true });
    } catch {
      // ignore
    }
  },
};

export default AsyncStorage;
