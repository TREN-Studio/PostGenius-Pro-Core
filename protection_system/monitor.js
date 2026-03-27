const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');

// Configuration
const PROTECTED_FILES = [
    './package.json',
    './fingerprint.js'
];

// Expected hashes (In production, these should be encrypted or fetched from server)
// For prototype, we will calculate them on start and pretend they are "known good"
const KNOWN_HASHES = {};

/**
 * Calculates SHA-256 checksum of a file
 */
function calculateChecksum(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Validates file integrity
 */
function validateIntegrity() {
    console.log("Verifying file integrity...");
    let tampered = false;

    PROTECTED_FILES.forEach(file => {
        const currentHash = calculateChecksum(file);

        // Simulating "Known Good" state for the first run
        if (!KNOWN_HASHES[file]) {
            KNOWN_HASHES[file] = currentHash;
        }

        if (currentHash !== KNOWN_HASHES[file]) {
            console.error(`PANIC: File '${file}' has been MODIFIED!`);
            tampered = true;
        }
    });

    if (tampered) {
        console.error("TAMPER DETECTED: Shutting down immediately.");
        process.exit(9); // 9 = SIGKILL equivalent convention
    }
}

/**
 * Checks for known debugger processes
 */
function checkDebuggers() {
    const forbiddenApps = ['wireshark', 'fiddler', 'charles', 'cheatengine', 'x64dbg', 'ida64'];

    // Platform specific command
    const cmd = process.platform === 'win32' ? 'tasklist' : 'ps -A';

    exec(cmd, (err, stdout) => {
        if (err) return;

        const processes = stdout.toLowerCase();
        for (const app of forbiddenApps) {
            if (processes.includes(app)) {
                console.error(`SECURITY VIOLATION: Debugger detected (${app}). Terminating.`);
                process.exit(1);
            }
        }
    });
}

function startProtection() {
    console.log("Protection Monitor Started.");

    // Initial Check
    validateIntegrity();

    // Continuous Monitoring
    setInterval(() => {
        validateIntegrity(); // Check if files changed at runtime
        checkDebuggers();    // Check if blacklisted apps are running
    }, 5000); // Check every 5 seconds
}

// Start if run directly
if (require.main === module) {
    startProtection();
}

module.exports = { startProtection };
