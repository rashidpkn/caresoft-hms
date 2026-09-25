const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");

function configPath() {
  return path.join(app.getPath("userData"), "server.json");
}

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return { serverUrl: process.env.HMS_SERVER_URL || "http://127.0.0.1:3000" };
  }
}

function writeConfig(cfg) {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Synapse HMS",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const cfg = readConfig();
  win.loadURL(cfg.serverUrl).catch(() => {
    win.loadFile(path.join(__dirname, "offline.html"));
  });
}

app.whenReady().then(() => {
  ipcMain.handle("hms:get-config", () => readConfig());
  ipcMain.handle("hms:set-server", (_e, serverUrl) => {
    if (typeof serverUrl !== "string" || !/^https?:\/\//.test(serverUrl)) {
      throw new Error("Invalid server URL");
    }
    writeConfig({ serverUrl });
    return readConfig();
  });
  ipcMain.handle("hms:version", () => app.getVersion());
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
