# PostGenius Pro Protection System

This directory contains standalone prototypes for the Commercial-Grade Protection System.
**Note**: These scripts require a Node.js environment (e.g., Electron or Server-side Node). They cannot run in a standard browser.

## Setup

1. Open a terminal in this directory:
   ```bash
   cd protection_system
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

## Modules

### 1. Hardware ID Binding (`fingerprint.js`)
Generates a unique machine fingerprint using Motherboard Serial + CPU ID + OS UUID.
- **Run**: `node fingerprint.js`
- **Output**: A SHA-256 hash string.

### 2. Code Obfuscation (`obfuscator.js`)
Compiles JavaScript source files into V8 Bytecode (`.jsc`), making them unreadable to humans.
- **Run**: `node obfuscator.js input.js output.jsc`
- **Effect**: Creates `output.jsc` and `input.loader.js`.

### 3. Anti-Tamper & Debugger (`monitor.js`)
- **Self-Checksum**: Verifies integrity of critical files on startup.
- **Debugger Detection**: Checks for processes like Wireshark, Fiddler, etc.
- **Run**: `node monitor.js`

### 4. Remote License Validation (`license_client.js`)
- **Heartbeat**: Sends HWID + License Key to the server.
- **Self-Destruct**: Deletes the local license file if validation fails.
- **Run**: `node license_client.js`

## Integration Guide
 To use this in your production app (Electron):
 1. Import `validateLicense` from `license_client.js` and call it on app startup.
 2. Import `startProtection` from `monitor.js` and call it after license check.
 3. Use `obfuscator.js` in your build pipeline to compile your main process code.
