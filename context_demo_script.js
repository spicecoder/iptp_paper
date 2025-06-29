// context-demo.js
// Demonstration of DN instance context identification
// Shows how the same DN type can have multiple instances in one CPUX

const axios = require('axios');

// Line 5: Test CPUX with multiple DN2 instances
const DEMO_CPUX_DEFINITION = {
  cpuxId: "demo_multi_instance_cpux",
  contextId: "USER_123_SESSION_456", // User/operator context
  
  // Line 10: Initial intention that creates the field
  startIntention: {
    name: "start_multi_process",
    signal: [{ name: "start_multi_process", TV: "Y", response: "initiated" }],
    target: "O1"
  },
  
  // Line 16: Sequence with multiple DN2 instances
  sequence: [
    {
      stepId: 1,
      type: "intention-to-object",
      intention: "prepare_data_batch_1",
      designTimeSignal: [{ name: "start_multi_process", TV: "Y" }],
      source: "CPUX",
      target: "O1",
      consumeSignal: false
    },
    {
      stepId: 2, 
      type: "object-reflection", 
      intention: "process_batch_1",
      designTimeSignal: [{ name: "start_multi_process", TV: "Y" }],
      source: "O1",
      target: "DN2", // FIRST DN2 instance
      consumeSignal: false
    },
    {
      stepId: 3,
      type: "dn-emission",
      intention: "batch_1_complete", 
      designTimeSignal: [{ name: "batch_1_result", TV: "Y" }],
      source: "DN2",
      target: "O1",
      consumeSignal: false
    },
    {
      stepId: 4,
      type: "intention-to-object",
      intention: "prepare_data_batch_2",
      designTimeSignal: [{ name: "batch_1_result", TV: "Y" }],
      source: "O1", 
      target: "DN1",
      consumeSignal: true
    },
    {
      stepId: 5,
      type: "dn-emission",
      intention: "batch_2_ready",
      designTimeSignal: [{ name: "batch_2_data", TV: "Y" }],
      source: "DN1",
      target: "O1",
      consumeSignal: false
    },
    {
      stepId: 6,
      type: "intention-to-object", 
      intention: "process_batch_2",
      designTimeSignal: [{ name: "batch_2_data", TV: "Y" }],
      source: "O1",
      target: "DN2", // SECOND DN2 instance (same DN type, different instance)
      consumeSignal: true
    },
    {
      stepId: 7,
      type: "dn-emission",
      intention: "batch_2_complete", 
      designTimeSignal: [{ name: "batch_2_result", TV: "Y" }],
      source: "DN2",
      target: "O1",
      consumeSignal: false
    },
    {
      stepId: 8,
      type: "intention-to-object",
      intention: "finalize_results",
      designTimeSignal: [
        { name: "batch_1_result", TV: "Y" },
        { name: "batch_2_result", TV: "Y" }
      ],
      source: "O1", 
      target: "DN3",
      consumeSignal: true
    }
  ]
};

// Line 79: Function to demonstrate instance tracking
async function demonstrateInstanceTracking() {
  console.log("=== DN Instance Context Demonstration ===\n");
  
  const contextId = DEMO_CPUX_DEFINITION.contextId;
  
  console.log(`Context ID: ${contextId}`);
  console.log("This demonstrates how DN instances are uniquely identified:\n");
  
  // Line 87: Show how DN instances are identified
  DEMO_CPUX_DEFINITION.sequence.forEach((step, index) => {
    if (step.target.startsWith('DN')) {
      const instanceId = `${contextId}:${step.stepId}:${step.target}`;
      console.log(`Step ${step.stepId}: ${step.target} instance ID = ${instanceId}`);
      
      if (step.target === 'DN2') {
        console.log(`  ^ This is DN2 instance #${step.stepId === 2 ? '1' : '2'} (same DN type, different context)`);
      }
    }
  });
  
  console.log("\nKey Points:");
  console.log("• DN2 appears twice but as different instances");
  console.log("• Instance USER_123_SESSION_456:2:DN2 handles batch 1");
  console.log("• Instance USER_123_SESSION_456:6:DN2 handles batch 2"); 
  console.log("• Each instance can be busy/ready independently");
  console.log("• DN server tracks each instance separately\n");
}

// Line 105: Function to simulate concurrent DN instance requests
async function simulateConcurrentRequests() {
  console.log("=== Simulating Concurrent DN Instance Requests ===\n");
  
  const contextId = "USER_123_SESSION_456";
  const dnServerUrl = "http://localhost:5001";
  
  // Line 111: Simulate first DN2 instance request
  const instance1Payload = {
    cpuxId: contextId,
    stepId: 2,
    intention: "process_batch_1",
    target: "DN2",
    signal: [{ name: "start_multi_process", TV: "Y", response: "batch_1_data" }],
    dnInstanceId: `${contextId}:2:DN2`
  };
  
  // Line 121: Simulate second DN2 instance request
  const instance2Payload = {
    cpuxId: contextId,
    stepId: 6,
    intention: "process_batch_2", 
    target: "DN2",
    signal: [{ name: "batch_2_data", TV: "Y", response: "batch_2_data" }],
    dnInstanceId: `${contextId}:6:DN2`
  };
  
  console.log("Sending concurrent requests to same DN type (DN2):");
  console.log(`Instance 1: ${instance1Payload.dnInstanceId}`);
  console.log(`Instance 2: ${instance2Payload.dnInstanceId}`);
  
  try {
    // Line 134: Send both requests (would normally be separated in time)
    console.log("\n--- Sending Request to Instance 1 ---");
    const response1 = await axios.post(`${dnServerUrl}/execute`, instance1Payload);
    console.log("Response 1:", response1.data);
    
    console.log("\n--- Sending Request to Instance 2 ---");
    const response2 = await axios.post(`${dnServerUrl}/execute`, instance2Payload);
    console.log("Response 2:", response2.data);
    
    // Line 143: Check DN server status
    console.log("\n--- Checking DN Server Status ---");
    const statusResponse = await axios.get(`${dnServerUrl}/status`);
    console.log("Running instances:", statusResponse.data.summary.running);
    
  } catch (error) {
    console.log("Note: This demo requires the DN server to be running.");
    console.log("Start the DN server first: node enhanced-dn-container-server.js");
    console.log(`Error: ${error.message}`);
  }
}

// Line 153: Function to show busy instance rejection
async function demonstrateBusyInstanceRejection() {
  console.log("\n=== Demonstrating Busy Instance Rejection ===\n");
  
  const contextId = "USER_123_SESSION_456";
  const dnServerUrl = "http://localhost:5001";
  
  const instancePayload = {
    cpuxId: contextId,
    stepId: 2,
    intention: "process_batch_1",
    target: "DN2",
    signal: [{ name: "start_multi_process", TV: "Y" }],
    dnInstanceId: `${contextId}:2:DN2`
  };
  
  try {
    console.log("Sending first request to DN2 instance...");
    const response1 = await axios.post(`${dnServerUrl}/execute`, instancePayload);
    console.log("First request response:", response1.data);
    
    console.log("\nImmediately sending second request to SAME instance...");
    const response2 = await axios.post(`${dnServerUrl}/execute`, instancePayload);
    console.log("Second request response:", response2.data);
    
    if (response2.data.status === 'rejected' && response2.data.reason === 'instance_busy') {
      console.log("\n✅ Correct behavior: Same instance rejected when busy");
    } else {
      console.log("\n❌ Unexpected behavior: Should have rejected busy instance");
    }
    
  } catch (error) {
    console.log("Note: This demo requires the DN server to be running.");
    console.log(`Error: ${error.message}`);
  }
}

// Line 183: Main demonstration function
async function runDemo() {
  console.log("DN Instance Context Identification Demo\n");
  console.log("This demonstrates how CPUX handles multiple instances of the same DN type\n");
  
  // Line 188: Show the theoretical model
  await demonstrateInstanceTracking();
  
  // Line 191: Show practical implementation (requires servers running)
  console.log("=== Practical Demonstration ===");
  console.log("(Requires DN server running on port 5001)");
  
  await simulateConcurrentRequests();
  await demonstrateBusyInstanceRejection();
  
  console.log("\n=== Summary ===");
  console.log("✅ Each DN instance has unique ID: contextId:stepId:dnType");
  console.log("✅ Multiple instances of same DN type can run concurrently");
  console.log("✅ Busy instances reject new requests while processing");
  console.log("✅ Context isolation ensures proper CPUX separation");
}

// Line 204: Run the demo
if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = {
  DEMO_CPUX_DEFINITION,
  demonstrateInstanceTracking,
  simulateConcurrentRequests,
  demonstrateBusyInstanceRejection
};