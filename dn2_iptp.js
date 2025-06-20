/**
 * DN2 Login Server - IPTP Protocol Compliant
 * Handles intentions from headers, processes signals as payload
 * Demonstrates proper Design Node implementation in IPTP
 */

const express = require('express');
const app = express();

app.use(express.json());

// DN2 Configuration
const DN2_CONFIG = {
    nodeId: "DN2",
    name: "Login Authentication Server",
    supportedIntentions: ["Log me in"],
    version: "1.0.0"
};

// User database and login attempts storage
const userDatabase = new Map([
    ["alice@example.com", { password: "secret123", name: "Alice Wonderland", role: "user" }],
    ["john.doe@example.com", { password: "securePassword123", name: "John Doe", role: "admin" }],
    ["test@example.com", { password: "testpass", name: "Test User", role: "guest" }]
]);

const loginAttempts = [];

/**
 * IPTP Protocol Endpoint for Design Node
 * Intentions in headers, signals as payload
 */
app.post('/iptp', (req, res) => {
    try {
        // Extract IPTP protocol headers
        const intention = req.headers['x-iptp-intention'];
        const source = req.headers['x-iptp-source'];
        const target = req.headers['x-iptp-target'];
        const timestamp = req.headers['x-iptp-timestamp'] || new Date().toISOString();
        
        // Signal is the request body (payload)
        const signal = req.body;

        console.log(`\n=== DN2 Received IPTP Message ===`);
        console.log(`Headers:`);
        console.log(`  X-IPTP-Intention: ${intention}`);
        console.log(`  X-IPTP-Source: ${source}`);
        console.log(`  X-IPTP-Target: ${target} (this node: ${DN2_CONFIG.nodeId})`);
        console.log(`  X-IPTP-Timestamp: ${timestamp}`);
        console.log(`Payload (Signal):`, JSON.stringify(signal, null, 2));

        // Validate IPTP headers
        if (!intention || !source) {
            return res.status(400).json({
                error: "Invalid IPTP headers",
                message: "Required headers: X-IPTP-Intention, X-IPTP-Source"
            });
        }

        // Check if DN2 supports this intention
        if (!DN2_CONFIG.supportedIntentions.includes(intention)) {
            return res.status(400).json({
                error: "Unsupported intention",
                message: `DN2 does not support intention: "${intention}"`,
                supportedIntentions: DN2_CONFIG.supportedIntentions
            });
        }

        // Process the intention based on header
        const result = processIntention(intention, source, signal, timestamp);
        
        res.json({
            protocol: "IPTP/1.0",
            node: DN2_CONFIG.nodeId,
            intentionProcessed: intention,
            source: source,
            result: result
        });

    } catch (error) {
        console.error('DN2 IPTP processing error:', error);
        res.status(500).json({
            error: "DN2 processing failed",
            message: error.message
        });
    }
});

/**
 * Process intention declaratively based on header
 */
function processIntention(intention, source, signal, timestamp) {
    console.log(`\n--- DN2 Processing Intention: "${intention}" ---`);
    
    switch (intention) {
        case "Log me in":
            return processLoginIntention(signal, source, timestamp);
        
        default:
            return {
                success: false,
                reason: `Unknown intention: ${intention}`,
                code: "UNKNOWN_INTENTION"
            };
    }
}

/**
 * Process "Log me in" intention
 */
function processLoginIntention(signal, source, timestamp) {
    try {
        console.log(`Processing login intention from ${source}`);
        
        // Extract credentials from signal
        const credentials = extractCredentialsFromSignal(signal);
        
        if (!credentials.username || !credentials.password) {
            return {
                success: false,
                reason: "Incomplete credentials in signal",
                code: "INCOMPLETE_CREDENTIALS",
                requiredPulses: ["user name present", "password present"]
            };
        }

        console.log(`Extracted credentials: ${credentials.username} / [REDACTED]`);

        // Authenticate user
        const authResult = authenticateUser(credentials.username, credentials.password);
        
        // Log attempt
        const attempt = {
            timestamp: timestamp,
            username: credentials.username,
            source: source,
            result: authResult.success ? 'SUCCESS' : 'FAILED',
            reason: authResult.reason,
            code: authResult.code
        };
        
        loginAttempts.push(attempt);
        
        console.log(`Authentication result: ${authResult.success ? 'SUCCESS' : 'FAILED'}`);
        console.log(`Reason: ${authResult.reason}`);

        // Emit appropriate intention based on result
        if (authResult.success) {
            emitIPTPIntention("Authentication successful", DN2_CONFIG.nodeId, "O2", 
                createSuccessSignal(credentials.username, authResult.user));
        } else {
            emitIPTPIntention("Authentication failed", DN2_CONFIG.nodeId, "O2", 
                createFailureSignal(credentials.username, authResult.reason));
        }

        return {
            success: authResult.success,
            reason: authResult.reason,
            code: authResult.code,
            username: credentials.username,
            emittedIntention: authResult.success ? "Authentication successful" : "Authentication failed"
        };

    } catch (error) {
        console.error('Login processing error:', error);
        return {
            success: false,
            reason: "Internal processing error",
            code: "PROCESSING_ERROR"
        };
    }
}

/**
 * Extract credentials from IPTP signal
 */
function extractCredentialsFromSignal(signal) {
    const credentials = {};
    
    if (!Array.isArray(signal)) {
        console.error('Signal must be an array of pulses');
        return credentials;
    }
    
    signal.forEach(pulse => {
        if (pulse.name === "user name present" && pulse.TV === "Y") {
            credentials.username = pulse.response;
        } else if (pulse.name === "password present" && pulse.TV === "Y") {
            credentials.password = pulse.response;
        }
    });
    
    return credentials;
}

/**
 * Authenticate user against database
 */
function authenticateUser(username, password) {
    console.log(`\n--- Authentication Process ---`);
    console.log(`Username: ${username}`);

    // Check if user exists
    if (!userDatabase.has(username)) {
        console.log(`❌ User not found: ${username}`);
        return {
            success: false,
            reason: "User not found",
            code: "USER_NOT_FOUND"
        };
    }

    const user = userDatabase.get(username);
    
    // Verify password
    if (user.password !== password) {
        console.log(`❌ Invalid password for user: ${username}`);
        return {
            success: false,
            reason: "Invalid password",
            code: "INVALID_PASSWORD"
        };
    }

    console.log(`✅ Authentication successful for: ${username}`);
    return {
        success: true,
        reason: "Authentication successful",
        code: "AUTH_SUCCESS",
        user: {
            username: username,
            name: user.name,
            role: user.role
        }
    };
}

/**
 * Create success signal for IPTP emission
 */
function createSuccessSignal(username, user) {
    return [
        { name: "user authenticated", TV: "Y", response: username },
        { name: "authentication timestamp", TV: "Y", response: new Date().toISOString() },
        { name: "user profile", TV: "Y", response: user },
        { name: "session created", TV: "Y", response: generateSessionToken() }
    ];
}

/**
 * Create failure signal for IPTP emission
 */
function createFailureSignal(username, reason) {
    return [
        { name: "authentication failed", TV: "Y", response: reason },
        { name: "failed username", TV: "Y", response: username },
        { name: "failure timestamp", TV: "Y", response: new Date().toISOString() },
        { name: "retry allowed", TV: "Y", response: "true" }
    ];
}

/**
 * Generate session token (simplified)
 */
function generateSessionToken() {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Emit IPTP intention with proper protocol headers
 */
async function emitIPTPIntention(intention, source, target, signal) {
    try {
        console.log(`\n--- DN2 Emitting IPTP Intention ---`);
        console.log(`Intention: "${intention}"`);
        console.log(`Source: ${source} -> Target: ${target}`);
        console.log(`Signal pulses: ${signal.length}`);

        const targetUrl = getTargetUrl(target);
        
        // Note: In a real system, this would send to the target
        // For demonstration, we'll just log the IPTP emission
        console.log(`Would send IPTP message to: ${targetUrl}`);
        console.log(`Headers:`);
        console.log(`  X-IPTP-Intention: ${intention}`);
        console.log(`  X-IPTP-Source: ${source}`);
        console.log(`  X-IPTP-Target: ${target}`);
        console.log(`Payload:`, JSON.stringify(signal, null, 2));
        
        console.log(`✅ IPTP intention "${intention}" emitted to ${target}`);

    } catch (error) {
        console.error(`❌ Error emitting IPTP intention:`, error.message);
    }
}

/**
 * Get target URL for IPTP emission
 */
function getTargetUrl(target) {
    const targetUrls = {
        "O1": "http://localhost:3000/iptp",
        "O2": "http://localhost:3000/iptp",
        "DN1": "http://localhost:3002/iptp",
        "DN3": "http://localhost:3003/iptp"
    };
    
    return targetUrls[target] || "http://localhost:3000/iptp";
}

/**
 * Get DN2 node information
 */
app.get('/iptp/node-info', (req, res) => {
    res.json({
        protocol: "IPTP/1.0",
        node: DN2_CONFIG,
        endpoints: {
            iptp: "/iptp",
            nodeInfo: "/iptp/node-info",
            status: "/dn2/status",
            attempts: "/dn2/attempts"
        }
    });
});

/**
 * Get DN2 status and statistics
 */
app.get('/dn2/status', (req, res) => {
    res.json({
        nodeId: DN2_CONFIG.nodeId,
        name: DN2_CONFIG.name,
        version: DN2_CONFIG.version,
        status: "active",
        uptime: process.uptime(),
        supportedIntentions: DN2_CONFIG.supportedIntentions,
        statistics: {
            totalLoginAttempts: loginAttempts.length,
            successfulLogins: loginAttempts.filter(a => a.result === 'SUCCESS').length,
            failedLogins: loginAttempts.filter(a => a.result === 'FAILED').length
        },
        recentAttempts: loginAttempts.slice(-3)
    });
});

/**
 * Get all login attempts
 */
app.get('/dn2/attempts', (req, res) => {
    res.json({
        nodeId: DN2_CONFIG.nodeId,
        protocol: "IPTP/1.0",
        attempts: loginAttempts
    });
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
    res.json({
        nodeId: DN2_CONFIG.nodeId,
        status: "healthy",
        protocol: "IPTP/1.0",
        timestamp: new Date().toISOString()
    });
});

// Start DN2 server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`\n🟢 DN2 IPTP Login Server started on port ${PORT}`);
    console.log(`Node ID: ${DN2_CONFIG.nodeId}`);
    console.log(`Name: ${DN2_CONFIG.name}`);
    console.log(`Protocol: IPTP/1.0`);
    console.log(`Supported Intentions: ${DN2_CONFIG.supportedIntentions.join(', ')}`);
    console.log('\nIPTP Endpoints:');
    console.log(`POST /iptp - Main IPTP protocol endpoint`);
    console.log(`GET  /iptp/node-info - Node configuration`);
    console.log(`GET  /dn2/status - Status and statistics`);
    console.log(`GET  /dn2/attempts - Login attempt history`);
    console.log(`GET  /health - Health check`);
    console.log('\nExample IPTP request:');
    console.log('curl -X POST http://localhost:3001/iptp \\');
    console.log('  -H "X-IPTP-Intention: Log me in" \\');
    console.log('  -H "X-IPTP-Source: O1" \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'[{"name": "user name present", "TV": "Y", "response": "alice@example.com"}]\'');
    console.log('\n🔒 DN2 ready to process login authentications via IPTP protocol');
});

module.exports = app;