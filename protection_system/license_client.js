const axios = require('axios');
const fs = require('fs');
const { generateHardwareFingerprint } = require('./fingerprint');

// Configuration
const LICENSE_FILE = './license.key';
// Use the proxy.php URL as requested (Placeholder for actual full URL)
// CRITICAL: REPLACE THIS WITH YOUR HOSTINGER PROXY URL
// Example: 'https://larbilife.com/api/proxy.php?action=validate_license'
// It must match the location where you uploaded 'php_backend/proxy.php'
const SERVER_URL = 'https://REPLACE_WITH_YOUR_DOMAIN.com/path/to/proxy.php?action=validate_license';


async function validateLicense() {
    try {
        // 1. Check if license file exists
        if (!fs.existsSync(LICENSE_FILE)) {
            throw new Error("License file missing.");
        }

        const licenseKey = fs.readFileSync(LICENSE_FILE, 'utf8').trim();
        const hwid = await generateHardwareFingerprint();

        console.log(`Verifying License for HWID: ${hwid}...`);

        // 2. Send Heartbeat Request
        // In a real scenario, we would encrypt this payload with AES-256
        const response = await axios.post(SERVER_URL, {
            license_key: licenseKey,
            hwid: hwid,
            timestamp: Date.now()
        }, {
            // Short timeout to prevent hanging
            timeout: 5000,
            validateStatus: () => true // Handle all status codes manually
        });

        // 3. Handle Server Response
        // Since we don't have the actual server running, we simulate logic based on imaginary codes
        if (response.data && response.data.status === 'valid') {
            console.log("License Verified: ACTIVE");
            return true;
        } else {
            console.warn("Server Response:", response.data);
            throw new Error("License Invalid or Expired");
        }

    } catch (error) {
        console.error("License Validation FAILED:", error.message);

        // 4. Self-Destruct Logic
        if (fs.existsSync(LICENSE_FILE)) {
            console.warn("INITIATING SELF-DESTRUCT: Deleting local license key...");
            try {
                fs.unlinkSync(LICENSE_FILE);
                console.log("License deleted. App will now close.");
            } catch (delErr) {
                console.error("Failed to delete license:", delErr);
            }
        }
        process.exit(1);
    }
}

// Create a dummy license for testing if it doesn't exist
if (!fs.existsSync(LICENSE_FILE)) {
    fs.writeFileSync(LICENSE_FILE, "TEST-LICENSE-KEY-12345");
    console.log("Created dummy license file for testing.");
}

// Run Validation
if (require.main === module) {
    validateLicense();
}

module.exports = { validateLicense };
