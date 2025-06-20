/**
 * IPTP Protocol Server Implementation
 * Proper separation: Intentions in headers, Signals as payload
 * Objects handle routing declaratively based on header intentions
 */

const express = require('express');
const app = express();

app.use(express.json());

// Object registry with intention mappings
const objectRegistry = new Map();
const objectStates = new Map();

/**
 * IPTP Protocol Headers Structure:
 * X-IPTP-Intention: "Log me in"
 * X-IPTP-Source: "DN1" 
 * X-IPTP-Target: "O1"
 * X-IPTP-Timestamp: "2024-06-20T10:30:00Z"
 * 
 * Payload: Signal (array of pulses)
 */

/**
 * Register an Object with its intention handling capabilities
 */
function registerObject(objectId, intentionMappings) {
    objectRegistry.set(objectId, {
        objectId,
        intentionMappings, // Map of incoming intentions -> outgoing intentions
        fieldState: [],
        registered: new Date().toISOString()
    });
    
    objectStates.set(objectId, {
        objectId,
        pulses: [],
        triggerDefinitions: []
    });
    
    console.log(`📝 Registered object ${objectId} with ${intentionMappings.length} intention mappings`);
}

/**
 * IPTP Core Protocol Endpoint
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

        console.log(`\n=== IPTP Protocol Message ===`);
        console.log(`Headers:`);
        console.log(`  X-IPTP-Intention: ${intention}`);
        console.log(`  X-IPTP-Source: ${source}`);
        console.log(`  X-IPTP-Target: ${target}`);
        console.log(`  X-IPTP-Timestamp: ${timestamp}`);
        console.log(`Payload (Signal):`, JSON.stringify(signal, null, 2));

        // Validate IPTP headers
        if (!intention || !source || !target) {
            return res.status(400).json({
                error: "Invalid IPTP headers",
                message: "Required headers: X-IPTP-Intention, X-IPTP-Source, X-IPTP-Target"
            });
        }

        // Check if target object is registered
        if (!objectRegistry.has(target)) {
            return res.status(404).json({
                error: "Object not found",
                message: `Target object ${target} not registered in IPTP registry`
            });
        }

        // Process the IPTP message
        const result = processIPTPMessage(intention, source, target, signal, timestamp);
        
        res.json({
            protocol: "IPTP/1.0",
            processed: true,
            target: target,
            intention: intention,
            result: result
        });

    } catch (error) {
        console.error('IPTP protocol error:', error);
        res.status(500).json({
            error: "IPTP processing failed",
            message: error.message
        });
    }
});

/**
 * Process IPTP message using declarative intention mapping
 */
function processIPTPMessage(intention, source, target, signal, timestamp) {
    const objectConfig = objectRegistry.get(target);
    
    console.log(`\n--- Processing IPTP Message ---`);
    console.log(`Target Object: ${target}`);
    console.log(`Looking for intention mapping: "${intention}"`);

    // Find matching intention mapping
    const intentionMapping = objectConfig.intentionMappings.find(
        mapping => mapping.incomingIntention === intention
    );

    if (!intentionMapping) {
        console.log(`❌ No intention mapping found for "${intention}" in object ${target}`);
        return {
            absorbed: false,
            reason: "No intention mapping found",
            availableIntentions: objectConfig.intentionMappings.map(m => m.incomingIntention)
        };
    }

    console.log(`✅ Found intention mapping: "${intention}" -> "${intentionMapping.outgoingIntention}"`);

    // Step 1: Absorb signal into object field
    const absorbed = FieldAbsorb(target, signal);
    
    if (!absorbed) {
        return {
            absorbed: false,
            reason: "FieldAbsorb failed"
        };
    }

    // Step 2: Check trigger conditions declaratively
    const triggerResult = FieldTrigger(
        target, 
        intentionMapping.triggerCondition,
        intentionMapping.outgoingIntention,
        intentionMapping.targetNode
    );

    return {
        absorbed: true,
        fieldUpdated: true,
        triggerEvaluated: true,
        triggerResult: triggerResult
    };
}

/**
 * FieldAbsorb: Integrate signal into object's field state
 */
function FieldAbsorb(objectId, signal) {
    try {
        if (!Array.isArray(signal)) {
            console.error('Signal must be an array of pulses');
            return false;
        }

        const objectField = objectStates.get(objectId);
        const existingPulseMap = new Map();
        
        objectField.pulses.forEach((pulse, index) => {
            existingPulseMap.set(pulse.name, index);
        });

        signal.forEach(incomingPulse => {
            if (existingPulseMap.has(incomingPulse.name)) {
                // Update existing pulse
                const existingIndex = existingPulseMap.get(incomingPulse.name);
                const existingPulse = objectField.pulses[existingIndex];
                existingPulse.TV = incomingPulse.TV;
                
                if (incomingPulse.response !== undefined) {
                    existingPulse.response = incomingPulse.response;
                }
            } else {
                // Add new pulse
                objectField.pulses.push({
                    name: incomingPulse.name,
                    TV: incomingPulse.TV,
                    response: incomingPulse.response
                });
            }
        });

        console.log(`FieldAbsorb: Absorbed ${signal.length} pulse(s) into ${objectId}`);
        console.log(`Current field state: ${objectField.pulses.length} pulses`);
        
        return true;
    } catch (error) {
        console.error(`FieldAbsorb error:`, error);
        return false;
    }
}

/**
 * FieldTrigger: Declarative trigger evaluation
 */
function FieldTrigger(objectId, triggerCondition, outgoingIntention, targetNode) {
    try {
        const objectField = objectStates.get(objectId);
        
        // Create field pulse map for efficient lookup
        const fieldPulseMap = new Map();
        objectField.pulses.forEach(pulse => {
            fieldPulseMap.set(pulse.name, pulse);
        });

        console.log(`\n--- FieldTrigger Evaluation ---`);
        console.log(`Checking condition:`, JSON.stringify(triggerCondition, null, 2));

        // Evaluate trigger condition
        let conditionMet = true;
        const matchingPulses = [];

        for (const requiredPulse of triggerCondition) {
            const fieldPulse = fieldPulseMap.get(requiredPulse.name);
            
            if (!fieldPulse) {
                console.log(`❌ Required pulse "${requiredPulse.name}" not found in field`);
                conditionMet = false;
                break;
            }

            if (fieldPulse.TV !== requiredPulse.TV) {
                console.log(`❌ Pulse "${requiredPulse.name}" TV mismatch. Required: ${requiredPulse.TV}, Found: ${fieldPulse.TV}`);
                conditionMet = false;
                break;
            }

            matchingPulses.push({
                name: fieldPulse.name,
                TV: fieldPulse.TV,
                response: fieldPulse.response
            });
        }

        if (conditionMet) {
            console.log(`✅ All trigger conditions satisfied`);
            
            // Prepare complete signal for outgoing intention
            const completeSignal = prepareCompleteSignal(objectField);
            
            // Emit intention with IPTP protocol
            emitIPTPIntention(outgoingIntention, objectId, targetNode, completeSignal);
            
            return {
                triggered: true,
                outgoingIntention: outgoingIntention,
                targetNode: targetNode,
                signalPulses: completeSignal.length
            };
        } else {
            console.log(`❌ Trigger conditions not met`);
            return {
                triggered: false,
                reason: "Trigger conditions not satisfied"
            };
        }

    } catch (error) {
        console.error(`FieldTrigger error:`, error);
        return {
            triggered: false,
            reason: error.message
        };
    }
}

/**
 * Prepare complete signal from object field
 */
function prepareCompleteSignal(objectField) {
    return objectField.pulses.filter(pulse => pulse.TV === 'Y');
}

/**
 * Emit IPTP intention with proper protocol headers
 */
async function emitIPTPIntention(intention, source, target, signal) {
    try {
        const targetUrl = getNodeUrl(target);
        
        console.log(`\n--- Emitting IPTP Intention ---`);
        console.log(`Intention: "${intention}"`);
        console.log(`Source: ${source} -> Target: ${target}`);
        console.log(`URL: ${targetUrl}`);
        console.log(`Signal pulses: ${signal.length}`);

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-IPTP-Intention': intention,
                'X-IPTP-Source': source,
                'X-IPTP-Target': target,
                'X-IPTP-Timestamp': new Date().toISOString()
            },
            body: JSON.stringify(signal)
        });

        if (response.ok) {
            const result = await response.json();
            console.log(`✅ IPTP intention successfully emitted to ${target}`);
            console.log(`Response:`, JSON.stringify(result, null, 2));
        } else {
            console.error(`❌ Failed to emit IPTP intention: ${response.status}`);
        }

    } catch (error) {
        console.error(`❌ Error emitting IPTP intention:`, error.message);
    }
}

/**
 * Get node URL for IPTP communication
 */
function getNodeUrl(nodeId) {
    const nodeUrls = {
        "DN1": "http://localhost:3002/iptp",
        "DN2": "http://localhost:3001/iptp", 
        "DN3": "http://localhost:3003/iptp",
        "O1": "http://localhost:3000/iptp",
        "O2": "http://localhost:3000/iptp"
    };
    
    return nodeUrls[nodeId] || `http://localhost:3001/iptp`;
}

/**
 * Register O1 with its intention mappings
 */
function setupO1LoginObject() {
    const intentionMappings = [
        {
            incomingIntention: "Log me in",
            triggerCondition: [
                { name: "user responded", TV: "Y" }
            ],
            outgoingIntention: "Log me in",
            targetNode: "DN2"
        }
    ];
    
    registerObject("O1", intentionMappings);
    console.log(`✅ O1 (User State Object) registered with login intention mapping`);
}

/**
 * Get object state endpoint
 */
app.get('/iptp/object/:objectId/state', (req, res) => {
    const { objectId } = req.params;
    
    if (!objectStates.has(objectId)) {
        return res.status(404).json({
            error: "Object not found"
        });
    }

    const state = objectStates.get(objectId);
    const config = objectRegistry.get(objectId);
    
    res.json({
        objectId,
        state,
        configuration: config
    });
});

/**
 * Get IPTP registry
 */
app.get('/iptp/registry', (req, res) => {
    const registry = Array.from(objectRegistry.entries()).map(([id, config]) => ({
        objectId: id,
        intentionMappings: config.intentionMappings,
        registered: config.registered
    }));
    
    res.json({
        protocol: "IPTP/1.0",
        registry
    });
});

/**
 * Test endpoint for complete login flow
 */
app.post('/test/iptp-login', async (req, res) => {
    try {
        console.log('\n=== Testing IPTP Login Flow ===');
        
        // Reset O1 state
        if (objectStates.has("O1")) {
            objectStates.get("O1").pulses = [];
        }

        const baseUrl = 'http://localhost:3000';
        
        // Step 1: Send username with IPTP headers
        console.log('\n--- Step 1: Username ---');
        await fetch(`${baseUrl}/iptp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-IPTP-Intention': 'Log me in',
                'X-IPTP-Source': 'DN1',
                'X-IPTP-Target': 'O1'
            },
            body: JSON.stringify([{
                name: "user name present",
                TV: "Y",
                response: "alice@example.com"
            }])
        });

        // Step 2: Send password with IPTP headers
        console.log('\n--- Step 2: Password ---');
        await fetch(`${baseUrl}/iptp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-IPTP-Intention': 'Log me in',
                'X-IPTP-Source': 'DN1',
                'X-IPTP-Target': 'O1'
            },
            body: JSON.stringify([{
                name: "password present",
                TV: "Y",
                response: "secret123"
            }])
        });

        // Step 3: Send submit with IPTP headers (should trigger)
        console.log('\n--- Step 3: Submit (Trigger Expected) ---');
        await fetch(`${baseUrl}/iptp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-IPTP-Intention': 'Log me in',
                'X-IPTP-Source': 'DN1',
                'X-IPTP-Target': 'O1'
            },
            body: JSON.stringify([{
                name: "user responded",
                TV: "Y",
                response: "form_submitted"
            }])
        });

        const finalState = objectStates.get("O1");
        
        res.json({
            success: true,
            message: "IPTP login flow test completed",
            finalState: finalState
        });

    } catch (error) {
        console.error('IPTP test error:', error);
        res.status(500).json({
            error: "IPTP test failed",
            message: error.message
        });
    }
});

// Initialize system
setupO1LoginObject();

// Server startup
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 IPTP Protocol Server running on port ${PORT}`);
    console.log('\nIPTP Protocol Endpoints:');
    console.log('POST /iptp - Main IPTP protocol endpoint (intentions in headers, signals as payload)');
    console.log('GET  /iptp/registry - View registered objects and intention mappings');
    console.log('GET  /iptp/object/:id/state - Get object state');
    console.log('POST /test/iptp-login - Test IPTP login flow');
    console.log('\nRequired Headers for IPTP:');
    console.log('  X-IPTP-Intention: "intention name"');
    console.log('  X-IPTP-Source: "source node"');
    console.log('  X-IPTP-Target: "target object"');
    console.log('\nExample curl:');
    console.log('curl -X POST http://localhost:3000/iptp \\');
    console.log('  -H "X-IPTP-Intention: Log me in" \\');
    console.log('  -H "X-IPTP-Source: DN1" \\');
    console.log('  -H "X-IPTP-Target: O1" \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'[{"name": "user name present", "TV": "Y", "response": "alice@example.com"}]\'');
});

module.exports = app;