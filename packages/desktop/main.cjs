// Electron shell. `--dev` loads the Vite dev server; otherwise the built app from packages/app/dist.
// Saves live as JSON files in <userData>/saves (Steam Cloud can sync that folder later).
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const isDev = process.argv.includes('--dev');
const savesDir = () => path.join(app.getPath('userData'), 'saves');

/** Save ids come from the page: only allow simple names so they can never escape the saves folder. */
function savePath(id, suffix) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(id)) throw new Error('Invalid save id');
  return path.join(savesDir(), `${id}${suffix}`);
}

/** Write via a temp file and rename, so a crash mid-write never corrupts an existing save. */
async function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, data, 'utf8');
  await fs.rename(tmp, file);
}

function registerSaveHandlers() {
  ipcMain.handle('saves:folder', async () => savesDir());

  ipcMain.handle('saves:list', async () => {
    await fs.mkdir(savesDir(), { recursive: true });
    const files = (await fs.readdir(savesDir())).filter((f) => f.endsWith('.meta.json'));
    const metas = await Promise.all(
      files.map((f) => fs.readFile(path.join(savesDir(), f), 'utf8').catch(() => null)),
    );
    return metas.filter(Boolean);
  });

  ipcMain.handle('saves:read', async (_e, id) => {
    try {
      return await fs.readFile(savePath(id, '.json'), 'utf8');
    } catch {
      return null;
    }
  });

  ipcMain.handle('saves:write', async (_e, id, meta, data) => {
    if (typeof meta !== 'string' || typeof data !== 'string') throw new Error('Invalid save data');
    await fs.mkdir(savesDir(), { recursive: true });
    await writeAtomic(savePath(id, '.json'), data);
    await writeAtomic(savePath(id, '.meta.json'), meta);
  });

  ipcMain.handle('saves:delete', async (_e, id) => {
    await fs.rm(savePath(id, '.json'), { force: true });
    await fs.rm(savePath(id, '.meta.json'), { force: true });
  });

  ipcMain.on('app:quit', () => app.quit());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#f4efe4',
    title: 'Sand to Mind',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'app', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  registerSaveHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
