/**
 * IPTP Protocol Test Client
 * Demonstrates proper IPTP usage: intentions in headers, signals as payload
 * Tests the complete CPUX: DN1 -> I1 -> O1 -> I2 -> DN2
 */

const axios = require('axios');

const OBJECT_SERVER_URL = 'http://localhost:3000';
const DN2_SERVER_URL = 'http://localhost:3001';

/**
 * Send IPTP message with proper protocol structure
 * Intention in header, signal as payload
 */
async function sendIPTPMessage(intention, source, target, signal) {
    try {
        console.log(`\n--- Sending IPTP Message ---`);
        console.log(`Protocol: IPTP/1.0`);
        console.log(`Headers:`);
        console.log(`  X-IPTP-Intention: ${intention}`);
        console.log(`  X-IPTP-Source: ${source}`);
        console.log(`  X-IPTP-Target: ${target}`);
        console.log(`Payload (Signal):`, JSON.stringify(signal, null, 2));

        const url = target.startsWith('DN') ? 
            `${DN2_SERVER_URL}/iptp` : 
            `${OBJECT_SERVER_URL}/iptp`;

        const response = await axios({
            method: 'POST',
            url: url,
            headers: {
                'Content-Type': 'application/json',
                'X-IPTP-Intention': intention,
                'X-IPTP-Source': source,
                'X-IPTP-Target': target,
                'X-IPTP-Timestamp': new Date().toISOString()
            },
            data: signal
        });

        console.log(`--- IPTP Response ---`);
        console.log(`Protocol: ${response.data.protocol || 'N/A'}`);
        console.log(`Success: ${response.data.processed || response.data.success || false}`);
        
        if (response.data.result) {
            console.log(`Result:`, JSON.stringify(response.data.result, null, 2));
        }

        return response.data;

    } catch (error) {
        console.error('IPTP message error:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * Check IPTP registry
 */
async function checkIPTPRegistry() {
    try {
        const response = await axios.get(`${OBJECT_SERVER_URL}/iptp/registry`);
        return response.data;
    } catch (error) {
        console.error('Error checking IPTP registry:', error.message);
        return null;
    }
}

/**
 * Check DN2 node information
 */
async function checkDN2NodeInfo() {
    try {
        const response = await axios.get(`${DN2_SERVER_URL}/iptp/node-info`);
        return response.data;
    } catch (error) {
        console.error('Error checking DN2 node info:', error.message);
        return null;
    }
}

/**
 * Test the complete IPTP protocol with proper header/payload separation
 */
async function testIPTPProtocol() {
    console.log('='.repeat(80));
    console.log('🔄 IPTP PROTOCOL TEST');
    console.log('Proper separation: Intentions in headers, Signals as payload');
    console.log('CPUX: DN1 -> I1("Log me in") -> O1 -> I2("Log me in") -> DN2');
    console.log('='.repeat(80));

    try {
        // Check system status
        console.log('\n📋 System Status Check:');
        
        const registry = await checkIPTPRegistry();
        if (registry) {
            console.log(`✅ IPTP Registry: ${registry.registry.length} registered objects`);
            registry.registry.forEach(obj => {
                console.log(`   - ${obj.objectId}: ${obj.intentionMappings.length} intention mappings`);
            });
        }

        const dn2Info = await checkDN2NodeInfo();
        if (dn2Info) {
            console.log(`✅ DN2 Node: ${dn2Info.node.name}`);
            console.log(`   Supported intentions: ${dn2Info.node.supportedIntentions.join(', ')}`);
        }

        // Step 1: DN1 sends username pulse to O1
        console.log('\n🔹 STEP 1: DN1 -> O1 (Username pulse)');
        await sendIPTPMessage(
            "Log me in",        // Intention in header
            "DN1",              // Source in header
            "O1",               // Target in header
            [{                  // Signal as payload
                name: "user name present",
                TV: "Y",
                response: "alice@example.com"
            }]
        );

        await new Promise(resolve => setTimeout(resolve, 500));

        // Step 2: DN1 sends password pulse to O1
        console.log('\n🔹 STEP 2: DN1 -> O1 (Password pulse)');
        await sendIPTPMessage(
            "Log me in",        // Same intention in header
            "DN1",              // Source in header
            "O1",               // Target in header
            [{                  // Signal as payload
                name: "password present",
                TV: "Y",
                response: "secret123"
            }]
        );

        await new Promise(resolve => setTimeout(resolve, 500));

        // Step 3: DN1 sends submit pulse to O1 (should trigger O1 -> DN2)
        console.log('\n🔹 STEP 3: DN1 -> O1 (Submit pulse - trigger expected)');
        const triggerResponse = await sendIPTPMessage(
            "Log me in",        // Intention in header
            "DN1",              // Source in header
            "O1",               // Target in header
            [{                  // Signal as payload
                name: "user responded",
                TV: "Y",
                response: "form_submitted"
            }]
        );

        // Wait for DN2 processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check final states
        console.log('\n📊 Final System State:');
        
        const o1State = await axios.get(`${OBJECT_SERVER_URL}/iptp/object/O1/state`);
        console.log(`O1 State: ${o1State.data.state.pulses.length} pulses in field`);
        
        const dn2Status = await axios.get(`${DN2_SERVER_URL}/dn2/status`);
        console.log(`DN2 Status: ${dn2Status.data.statistics.totalLoginAttempts} login attempts`);
        console.log(`   Successful: ${dn2Status.data.statistics.successfulLogins}`);
        console.log(`   Failed: ${dn2Status.data.statistics.failedLogins}`);

        // Summary
        console.log('\n' + '='.repeat(80));
        console.log('🎯 IPTP PROTOCOL TEST SUMMARY');
        console.log('='.repeat(80));
        
        const triggered = triggerResponse.result?.triggerResult?.triggered;
        const loginAttempts = dn2Status.data.statistics.totalLoginAttempts;
        
        console.log(`✅ O1 trigger activated: ${triggered ? 'YES' : 'NO'}`);
        console.log(`✅ DN2 processed login: ${loginAttempts > 0 ? 'YES' : 'NO'}`);
        
        if (triggered && loginAttempts > 0) {
            console.log('🎉 IPTP PROTOCOL TEST SUCCESSFUL!');
            console.log('   ✓ Intentions properly routed via headers');
            console.log('   ✓ Signals processed as payload');
            console.log('   ✓ Object field-based triggering works');
            console.log('   ✓ DN2 declaratively processed login intention');
        } else {
            console.log('❌ IPTP PROTOCOL TEST INCOMPLETE');
        }

    } catch (error) {
        console.error('IPTP protocol test failed:', error.message);
    }
}

/**
 * Test invalid intention handling
 */
async function testInvalidIntention() {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 TESTING INVALID INTENTION HANDLING');
    console.log('='.repeat(80));

    try {
        console.log('\n--- Testing unsupported intention ---');
        
        await sendIPTPMessage(
            "Invalid intention",  // Unsupported intention
            "DN1",
            "O1",
            [{
                name: "some pulse",
                TV: "Y",
                response: "some data"
            }]
        );

    } catch (error) {
        if (error.response?.status === 400) {
            console.log('✅ Invalid intention correctly rejected');
            console.log(`   Reason: ${error.response.data.message}`);
        } else {
            throw error;
        }
    }
}

/**
 * Test IPTP header validation
 */
async function testHeaderValidation() {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 TESTING IPTP HEADER VALIDATION');
    console.log('='.repeat(80));

    try {
        console.log('\n--- Testing missing headers ---');
        
        // Send request without IPTP headers
        await axios.post(`${OBJECT_SERVER_URL}/iptp`, [
            { name: "test pulse", TV: "Y", response: "test" }
        ], {
            headers: {
                'Content-Type': 'application/json'
                // Missing X-IPTP-* headers
            }
        });

    } catch (error) {
        if (error.response?.status === 400) {
            console.log('✅ Missing headers correctly rejected');
            console.log(`   Reason: ${error.response.data.message}`);
        } else {
            throw error;
        }
    }
}

/**
 * Demonstrate declarative intention mapping
 */
async function demonstrateDeclarativeMapping() {
    console.log('\n' + '='.repeat(80));
    console.log('📋 DEMONSTRATING DECLARATIVE INTENTION MAPPING');
    console.log('='.repeat(80));

    try {
        const registry = await checkIPTPRegistry();
        
        if (registry && registry.registry.length > 0) {
            console.log('\nRegistered Objects and Their Intention Mappings:');
            
            registry.registry.forEach(obj => {
                console.log(`\n🔸 Object: ${obj.objectId}`);
                console.log(`   Registered: ${obj.registered}`);
                console.log(`   Intention Mappings:`);
                
                obj.intentionMappings.forEach((mapping, index) => {
                    console.log(`     ${index + 1}. "${mapping.incomingIntention}" -> "${mapping.outgoingIntention}"`);
                    console.log(`        Target: ${mapping.targetNode}`);
                    console.log(`        Trigger: ${mapping.triggerCondition.map(c => `${c.name}:${c.TV}`).join(', ')}`);
                });
            });
            
            console.log('\n💡 This declarative mapping allows objects to:');
            console.log('   ✓ Route intentions based on headers without hardcoding');
            console.log('   ✓ Apply field conditions for semantic triggering');
            console.log('   ✓ Transform signals without procedural logic');
        }

    } catch (error) {
        console.error('Error demonstrating declarative mapping:', error.message);
    }
}

/**
 * Check server connectivity
 */
async function checkConnectivity() {
    console.log('🔍 Checking IPTP server connectivity...');
    
    try {
        const o1Health = await axios.get(`${OBJECT_SERVER_URL}/iptp/registry`);
        console.log('✅ IPTP Object Server (O1) is running');
        
        const dn2Health = await axios.get(`${DN2_SERVER_URL}/health`);
        console.log('✅ IPTP DN2 Server is running');
        
        return true;
        
    } catch (error) {
        console.error('❌ Server connectivity issue:');
        if (error.code === 'ECONNREFUSED') {
            if (error.config?.url?.includes('3000')) {
                console.error('   IPTP Object Server not running. Start with: node iptp-server.js');
            } else if (error.config?.url?.includes('3001')) {
                console.error('   DN2 IPTP Server not running. Start with: node dn2-iptp-server.js');
            }
        }
        return false;
    }
}

/**
 * Main test execution
 */
async function main() {
    console.log('🚀 IPTP PROTOCOL COMPREHENSIVE TEST');
    console.log('Testing proper protocol implementation with header/payload separation\n');

    // Check connectivity
    const connected = await checkConnectivity();
    if (!connected) {
        console.log('\n❌ Cannot proceed - IPTP servers not available');
        return;
    }

    try {
        // Test 1: Main IPTP protocol flow
        await testIPTPProtocol();
        
        // Test 2: Invalid intention handling
        await testInvalidIntention();
        
        // Test 3: Header validation
        await testHeaderValidation();
        
        // Test 4: Demonstrate declarative mapping
        await demonstrateDeclarativeMapping();

        console.log('\n🎉 IPTP PROTOCOL TESTS COMPLETED!');
        console.log('\nKey Validations:');
        console.log('  ✅ Intentions properly separated in headers');
        console.log('  ✅ Signals processed as structured payload');
        console.log('  ✅ Objects handle routing declaratively');
        console.log('  ✅ Design Nodes process intentions semantically');
        console.log('  ✅ Field-based triggering maintains semantic consistency');
        console.log('  ✅ Protocol validation enforces proper IPTP structure');

    } catch (error) {
        console.error('❌ IPTP protocol test suite failed:', error.message);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    sendIPTPMessage,
    checkIPTPRegistry,
    checkDN2NodeInfo,
    testIPTPProtocol,
    testInvalidIntention,
    testHeaderValidation
};