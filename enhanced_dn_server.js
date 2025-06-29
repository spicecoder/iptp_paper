// enhanced-dn-container-server.js
// DN server that properly implements async emission pattern
// with immediate sync response and later intention emission

const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const PORT = 5001;
const CPUX_SERVER_URL = "http://localhost:3000";

// Line 12: DN instance execution tracking (contextId:stepId:DN -> task data)
let activeInstances = new Map(); // Track running DN instance tasks

// Line 15: Utility function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Line 20: DN Container Registry with async execution patterns
const DN_CONTAINERS = {
  DN1: {
    name: "Personal Detail Processor",
    valve: [{ name: "start_license_request", TV: "Y" }],
    handler: async (signal) => {
      console.log(`Line 26: DN1 processing personal details...`);
      
      // Line 28: Simulate async processing
      await sleep(2000);
      
      // Line 31: Generate result signal
      return [
        { 
          name: "personal_detail", 
          TV: "Y", 
          response: { 
            name: "Alice Johnson", 
            age: 24, 
            licenseType: "standard",
            fine_flag: "Y" 
          } 
        }
      ];
    }
  },
  
  DN2: {
    name: "Driver Points Fetcher", 
    valve: [{ name: "personal_detail", TV: "Y" }],
    handler: async (signal) => {
      console.log(`Line 49: DN2 fetching driver points...`);
      
      // Line 51: Extract personal details from signal
      const personalDetail = signal.find(p => p.name === "personal_detail");
      const person = personalDetail?.response;
      
      // Line 55: Simulate database lookup
      await sleep(1500);
      
      // Line 58: Generate driver points result
      return [
        { 
          name: "driver_points", 
          TV: "Y", 
          response: {
            currentPoints: 3,
            maxPoints: 12,
            violations: ["speeding_2023", "parking_2024"]
          }
        }
      ];
    }
  },
  
  DN3: {
    name: "License Expiry Calculator",
    valve: [{ name: "driver_points", TV: "Y" }],
    handler: async (signal) => {
      console.log(`Line 76: DN3 computing license expiry...`);
      
      // Line 78: Extract driver points from signal
      const driverPoints = signal.find(p => p.name === "driver_points");
      const points = driverPoints?.response;
      
      // Line 82: Simulate expiry calculation
      await sleep(1000);
      
      // Line 85: Calculate expiry based on points
      const baseExpiry = new Date();
      baseExpiry.setFullYear(baseExpiry.getFullYear() + (points?.currentPoints < 6 ? 5 : 3));
      
      return [
        { 
          name: "expiry_date", 
          TV: "Y", 
          response: {
            expiryDate: baseExpiry.toISOString().split('T')[0],
            validityPeriod: points?.currentPoints < 6 ? "5 years" : "3 years"
          }
        }
      ];
    }
  },
  
  DN4: {
    name: "License Generator",
    valve: [{ name: "expiry_date", TV: "Y" }],
    handler: async (signal) => {
      console.log(`Line 104: DN4 generating license...`);
      
      // Line 106: Extract all previous data
      const expiryData = signal.find(p => p.name === "expiry_date");
      
      // Line 109: Simulate license generation
      await sleep(2500);
      
      // Line 112: Generate final license
      return [
        { 
          name: "compiled_license", 
          TV: "Y", 
          response: {
            licenseId: `LIC${Date.now()}`,
            issueDate: new Date().toISOString().split('T')[0],
            expiryDate: expiryData?.response?.expiryDate,
            status: "active",
            digitalSignature: `SIG${Math.random().toString(36).substr(2, 9)}`
          }
        }
      ];
    }
  }
};

// Line 127: Async processing and emission function for DN instances
async function processAsyncAndEmit(container, dnType, inputSignal, cpuxId, originalIntention, instanceId) {
  try {
    console.log(`Line 131: DN instance ${instanceId} starting async processing...`);
    
    // Line 133: Execute DN handler
    const resultSignal = await container.handler(inputSignal);
    
    console.log(`Line 136: DN instance ${instanceId} completed processing, emitting intention`);
    console.log(`Line 137: Result signal:`, resultSignal);
    
    // Line 139: Prepare emission intention with instance tracking
    const emissionIntention = {
      cpuxId: cpuxId,
      intention: `result_${originalIntention}`, // Transform intention name
      source: dnType, // DN type (DN1, DN2, etc.)
      target: 'CPUX',
      signal: resultSignal,
      dnInstanceId: instanceId // Include instance ID for tracking
    };
    
    // Line 149: Emit intention back to CPUX server
    try {
      const emissionResponse = await axios.post(`${CPUX_SERVER_URL}/cpux/intention`, emissionIntention);
      
      console.log(`Line 153: DN instance ${instanceId} successfully emitted intention to CPUX`);
      console.log(`Line 154: CPUX response:`, emissionResponse.data);
      
      // Line 156: Mark instance as completed
      activeInstances.set(instanceId, { 
        status: 'completed', 
        completedTime: Date.now(),
        emitted: true,
        cpuxId: cpuxId,
        dnType: dnType
      });
      
    } catch (emissionError) {
      console.error(`Line 165: DN instance ${instanceId} failed to emit intention:`, emissionError.message);
      activeInstances.set(instanceId, { 
        status: 'emission_failed', 
        error: emissionError.message,
        cpuxId: cpuxId,
        dnType: dnType
      });
    }
    
  } catch (processingError) {
    console.error(`Line 174: DN instance ${instanceId} processing failed:`, processingError.message);
    activeInstances.set(instanceId, { 
      status: 'processing_failed', 
      error: processingError.message,
      cpuxId: cpuxId,
      dnType: dnType
    });
  }
}

// Line 183: Main execution endpoint - handles DN instance identification
app.post('/execute', async (req, res) => {
  const { cpuxId, stepId, intention, target, signal, dnInstanceId } = req.body;
  
  console.log(`\n=== DN Execute Request ===`);
  console.log(`Line 188: Target: ${target}, DN Instance: ${dnInstanceId || 'not provided'}`);
  console.log(`Line 189: Intention: ${intention}, CPUX: ${cpuxId}, Step: ${stepId}`);
  console.log(`Line 190: Signal:`, signal);
  
  const container = DN_CONTAINERS[target];
  if (!container) {
    console.error(`Line 194: Unknown DN: ${target}`);
    return res.status(400).json({ 
      status: 'rejected', 
      error: `Unknown DN: ${target}` 
    });
  }
  
  // Line 201: Create DN instance identifier if not provided
  const instanceId = dnInstanceId || `${cpuxId}:${stepId}:${target}`;
  
  console.log(`Line 204: Processing DN instance: ${instanceId}`);
  
  // Line 206: Check if this specific DN instance is already busy
  if (activeInstances.has(instanceId)) {
    const existingTask = activeInstances.get(instanceId);
    if (existingTask.status === 'running') {
      console.log(`Line 210: DN instance ${instanceId} is already busy`);
      return res.json({ 
        status: 'rejected', 
        reason: 'instance_busy',
        instanceId: instanceId
      });
    }
  }
  
  // Line 218: Check valve conditions for this DN type
  const canProcess = container.valve.every(requiredPulse => {
    return signal.some(incomingPulse => 
      incomingPulse.name === requiredPulse.name && 
      incomingPulse.TV === requiredPulse.TV
    );
  });
  
  if (!canProcess) {
    console.log(`Line 227: DN instance ${instanceId} valve conditions not met`);
    console.log(`Line 228: Required:`, container.valve);
    console.log(`Line 229: Received:`, signal.map(p => `${p.name}:${p.TV}`));
    return res.json({ 
      status: 'rejected', 
      reason: 'valve_conditions_not_met',
      instanceId: instanceId,
      required: container.valve,
      received: signal
    });
  }
  
  // Line 238: Accept the work and start async processing for this instance
  activeInstances.set(instanceId, { 
    status: 'running', 
    startTime: Date.now(),
    cpuxId: cpuxId,
    stepId: stepId,
    dnType: target,
    intention: intention
  });
  
  console.log(`Line 247: DN instance ${instanceId} accepted work, starting async processing`);
  
  // Line 249: Start async processing (don't await)
  processAsyncAndEmit(container, target, signal, cpuxId, intention, instanceId)
    .catch(error => {
      console.error(`Line 252: Error in async processing for instance ${instanceId}:`, error);
      activeInstances.set(instanceId, { 
        status: 'error', 
        error: error.message,
        cpuxId: cpuxId,
        stepId: stepId,
        dnType: target
      });
    });
  
  // Line 261: Return immediate sync response
  res.json({ 
    status: 'accepted',
    message: `DN instance ${instanceId} started processing`,
    instanceId: instanceId,
    dnType: target
  });
});

// Line 269: Status endpoint for DN instance monitoring
app.get('/status', (req, res) => {
  const runningInstances = Array.from(activeInstances.entries())
    .filter(([instanceId, task]) => task.status === 'running')
    .map(([instanceId, task]) => {
      return { 
        instanceId, 
        cpuxId: task.cpuxId,
        stepId: task.stepId,
        dnType: task.dnType,
        startTime: task.startTime,
        intention: task.intention
      };
    });
    
  const completedInstances = Array.from(activeInstances.entries())
    .filter(([instanceId, task]) => task.status === 'completed')
    .map(([instanceId, task]) => {
      return { 
        instanceId, 
        cpuxId: task.cpuxId,
        dnType: task.dnType,
        completedTime: task.completedTime
      };
    });
    
  res.json({
    runningInstances: runningInstances.length,
    completedInstances: completedInstances.length,
    totalInstances: activeInstances.size,
    containerTypes: Object.keys(DN_CONTAINERS),
    summary: {
      running: runningInstances,
      completed: completedInstances.slice(-5) // Last 5 completed
    }
  });
});

// Line 305: Instance status endpoint for specific instance monitoring
app.get('/instance/:instanceId/status', (req, res) => {
  const instanceId = req.params.instanceId;
  const instance = activeInstances.get(instanceId);
  
  if (!instance) {
    return res.status(404).json({ 
      error: 'Instance not found',
      instanceId: instanceId,
      availableInstances: Array.from(activeInstances.keys())
    });
  }
  
  res.json({
    instanceId,
    status: instance.status,
    cpuxId: instance.cpuxId,
    stepId: instance.stepId,
    dnType: instance.dnType,
    intention: instance.intention,
    startTime: instance.startTime,
    completedTime: instance.completedTime,
    error: instance.error
  });
});

// Line 328: Clean up old completed instances (optional maintenance)
app.post('/cleanup', (req, res) => {
  const { maxAge = 3600000 } = req.body; // Default 1 hour
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [instanceId, instance] of activeInstances.entries()) {
    if (instance.status === 'completed' && 
        instance.completedTime && 
        (now - instance.completedTime) > maxAge) {
      activeInstances.delete(instanceId);
      cleanedCount++;
    }
  }
  
  res.json({
    message: `Cleaned up ${cleanedCount} old completed instances`,
    remainingInstances: activeInstances.size,
    maxAge: maxAge
  });
});

// Line 347: Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    server: 'Enhanced DN Container Server',
    port: PORT,
    cpuxTarget: CPUX_SERVER_URL,
    registeredDNs: Object.keys(DN_CONTAINERS),
    activeInstances: activeInstances.size,
    timestamp: new Date().toISOString()
  });
});

// Line 358: Start DN container server
app.listen(PORT, () => {
  console.log(`Line 360: 🟢 Enhanced DN Container Server running on port ${PORT}`);
  console.log(`Line 361: Registered DN types: ${Object.keys(DN_CONTAINERS).join(', ')}`);
  console.log(`Line 362: CPUX emission target: ${CPUX_SERVER_URL}/cpux/intention`);
  console.log(`Line 363: Ready to accept DN instance work at /execute`);
  console.log(`Line 364: Instance tracking: contextId:stepId:dnType format`);
  console.log(`Line 365: Health check available at /health`);
  console.log(`Line 366: Status monitoring at /status`);
});

// Line 369: Export for testing
module.exports = {
  DN_CONTAINERS,
  activeInstances,
  processAsyncAndEmit
};