const { machineId } = require('node-machine-id');
const si = require('systeminformation');
const crypto = require('crypto');

/**
 * Generates a unique Hardware Fingerprint for the machine.
 * Combines OS UUID (machine-id) with CPU and Motherboard serials for robustness.
 */
async function generateHardwareFingerprint() {
    try {
        console.log("Gathering hardware metrics...");

        // 1. Get OS/Machine UUID
        const osId = await machineId();

        // 2. Get CPU Information
        const cpuData = await si.cpu();
        const cpuSerial = cpuData.brand + "_" + cpuData.speed + "_" + cpuData.cores; // Using robust fallback properties

        // 3. Get System/Motherboard Information
        const systemData = await si.system();
        const motherboardSerial = systemData.serial || systemData.uuid || "UNKNOWN_MB";

        // 4. Combine into a single string
        const rawFingerprint = `${osId}|${cpuSerial}|${motherboardSerial}`;

        // 5. Hash it securely
        const hash = crypto.createHash('sha256').update(rawFingerprint).digest('hex');

        console.log("\n=== Hardware Fingerprint Generated ===");
        console.log("Raw Data (Hidden):", rawFingerprint);
        console.log("Unique Hardware ID:", hash);
        console.log("======================================\n");

        return hash;
    } catch (error) {
        console.error("Failed to generate hardware fingerprint:", error);
        process.exit(1);
    }
}

// Execute if run directly
if (require.main === module) {
    generateHardwareFingerprint();
}

module.exports = { generateHardwareFingerprint };
