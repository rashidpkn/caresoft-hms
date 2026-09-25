# Electron desktop client

Build Windows installer (on Windows or with wine):

```bash
npm run electron:build -- --win nsis
```

Artifact: `dist-electron/SynapseHMS-Setup-1.0.0.exe`.

Linux AppImage (verified in this repo):

```bash
npx electron-builder --config electron-builder.yml --linux AppImage
```

The client loads `http://<server>:3000`. It stores the URL in the OS userData folder (`server.json`). Database credentials are never packaged.

If the server is down, `electron/offline.html` lets staff correct the URL.
