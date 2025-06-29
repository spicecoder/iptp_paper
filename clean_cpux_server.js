// clean-cpux-server.js
// CPUX server with clean deterministic pulse logic
// No waiting, no loops, pure field-gated execution

const axios = require('axios');
const express = require('express');
const app = express();
app.use(express.json());

const CPUX_PORT = 3000;
const CPUX_CONTEXT_ID = `CPUX_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

// Line 10: Service registry for routing intentions
const targetRegistry = {
  O1: "http://localhost:4000",
  DN1: "http://localhost:5001", 
  DN2: "http://localhost:5001",
  DN3: "http://localhost:5001",
  DN4: "http://localhost:5001"
};

// Line 18: CPUX state management - pure and simple
let cpuxField = {}; // The semantic field
let executionLog = new Set(); // Track completed steps
let memberStatus = new Map(); // Track DN instance states

// Line 23: CPUX Definition - clean sequence
const CPUXDefinition = {
  cpuxId: "make_license_cpux",
  startIntention: {
    name: "start_license_request",
    signal: [{ name: "start_license_request", TV: "Y", response: "initiated" }],
    target: "O1"
  },
  sequence: [
    {
      stepId: 1,
      intention: "add_personal_detail",
      designTimeSignal: [{ name: "start_license_request", TV: "Y" }],
      target: "O1",
      type: "object" // Sync reflection
    },
    {
      stepId: 2,
      intention: "fetch_personal_detail",
      designTimeSignal: [{ name: "start_license_request", TV: "Y" }],
      target: "DN1",
      type: "dn" // Async execution
    },
    {
      stepId: 3,
      intention: "reflect_personal_detail",
      designTimeSignal: [{ name: "personal_detail", TV: "Y" }],
      target: "O1",
      type: "object"
    },
    {
      stepId: 4,
      intention: "fetch_driver_points",
      designTimeSignal: [{ name: "personal_detail", TV: "Y" }],
      target: "DN2",
      type: "dn"
    },
    {
      stepId: 5,
      intention: "reflect_driver_points",
      designTimeSignal: [{ name: "driver_points", TV: "Y" }],
      target: "O1",
      type: "object"
    },
    {
      stepId: 6,
      intention: "compute_expiry",
      designTimeSignal: [{ name: "driver_points", TV: "Y" }],
      target: "DN3",
      type: "dn"
    },
    {
      stepId: 7,
      intention: "reflect_expiry",
      designTimeSignal: [{ name: "expiry_date", TV: "Y" }],
      target: "O1",
      type: "object"
    },
    {
      stepId: 8,
      intention: "generate_license",
      designTimeSignal: [{ name: "expiry_date", TV: "Y" }],
      target: "DN4",
      type: "dn"
    },
    {
      stepId: 9,
      intention: "license_complete",
      designTimeSignal: [{ name: "compiled_license", TV: "Y" }],
      target: "CONSOLE",
      type: "final"
    }
  ]
};

// Line 77: Pure field operations
function fieldAbsorb(incomingSignal, currentField) {
  const updatedField = { ...currentField };
  
  for (const pulse of incomingSignal) {
    updatedField[pulse.name] = {
      name: pulse.name,
      TV: pulse.TV,
      response: pulse.response || null,
      timestamp: new Date().toISOString()
    };
  }
  
  return updatedField;
}

function fieldMatch(field, requiredSignal) {
  return requiredSignal.every(requiredPulse => {
    const fieldPulse = field[requiredPulse.name];
    return fieldPulse && fieldPulse.TV === requiredPulse.TV;
  });
}

// Line 98: Initialize DN instance tracking
function initializeDNStatus(sequence, contextId) {
  sequence.forEach(step => {
    if (step.type === 'dn') {
      const dnInstanceId = `${contextId}:${step.stepId}:${step.target}`;
      memberStatus.set(dnInstanceId, 'ready');
    }
  });
}

// Line 107: Pure CPUX execution - no loops, no waiting
async function executeCPUX(cpuxDef) {
  const { cpuxId, startIntention, sequence } = cpuxDef;
  
  console.log(`\n=== CPUX ${cpuxId} Starting ===`);
  
  // Line 112: Initialize field with start intention
  cpuxField = fieldAbsorb(startIntention.signal, cpuxField);
  console.log("Initial field:", Object.keys(cpuxField));
  
  // Line 116: Initialize DN status
  initializeDNStatus(sequence, CPUX_CONTEXT_ID);
  
  // Line 119: Execute sequence - pure pass through
  await executeSequencePass(sequence);
  
  console.log(`\n=== CPUX ${cpuxId} Initial Pass Complete ===`);
  console.log("Field state:", Object.keys(cpuxField));
  console.log("Executed steps:", Array.from(executionLog));
  
  // Line 126: That's it! No loops. DNs will emit back when ready.
  console.log("✅ CPUX is now reactive - waiting for DN emissions");
}

// Line 130: Execute one clean pass through the sequence
async function executeSequencePass(sequence) {
  let passActivations = 0;
  
  console.log(`\n--- Executing Sequence Pass ---`);
  
  for (const step of sequence) {
    const stepKey = `${step.stepId}:${step.intention}:${step.target}`;
    
    // Line 138: Skip if already executed
    if (executionLog.has(stepKey)) {
      console.log(`Step ${step.stepId}: ${step.intention} → Already executed`);
      continue;
    }
    
    // Line 143: Check field match - deterministic
    const fieldMatches = fieldMatch(cpuxField, step.designTimeSignal);
    
    if (!fieldMatches) {
      console.log(`Step ${step.stepId}: ${step.intention} → Field mismatch`);
      console.log(`  Required: ${step.designTimeSignal.map(p => `${p.name}:${p.TV}`).join(', ')}`);
      console.log(`  Available: ${Object.keys(cpuxField).map(name => `${name}:${cpuxField[name].TV}`).join(', ')}`);
      continue;
    }
    
    // Line 151: Execute step based on type
    const executed = await executeStep(step);
    if (executed) {
      executionLog.add(stepKey);
      passActivations++;
      console.log(`Step ${step.stepId}: ${step.intention} → ✅ Executed`);
    }
  }
  
  console.log(`Pass complete: ${passActivations} activations`);
  return passActivations;
}

// Line 162: Execute individual step - clean and deterministic
async function executeStep(step) {
  try {
    // Line 165: Prepare signal from field
    const signalToSend = step.designTimeSignal.map(pulseSpec => {
      const fieldPulse = cpuxField[pulseSpec.name];
      return {
        name: pulseSpec.name,
        TV: pulseSpec.TV,
        response: fieldPulse?.response || null
      };
    });
    
    const payload = {
      cpuxId: CPUX_CONTEXT_ID,
      stepId: step.stepId,
      intention: step.intention,
      signal: signalToSend,
      target: step.target,
      dnInstanceId: step.type === 'dn' ? `${CPUX_CONTEXT_ID}:${step.stepId}:${step.target}` : null
    };
    
    // Line 181: Handle different step types
    if (step.type === 'object') {
      return await executeObjectStep(step, payload);
    } else if (step.type === 'dn') {
      return await executeDNStep(step, payload);
    } else if (step.type === 'final') {
      return executeFinalStep(step, signalToSend);
    }
    
    return false;
    
  } catch (error) {
    console.error(`Error executing step ${step.stepId}:`, error.message);
    return false;
  }
}

// Line 196: Execute object step - synchronous reflection
async function executeObjectStep(step, payload) {
  const memberUrl = targetRegistry[step.target];
  
  console.log(`→ Sending to Object ${step.target}: ${step.intention}`);
  
  try {
    // Line 203: Object executes synchronously and may reflect immediately
    const response = await axios.post(`${memberUrl}/execute`, payload);
    
    // Objects handle their own reflections via async emission to CPUX
    // We just mark this step as complete
    return true;
    
  } catch (error) {
    console.error(`Object ${step.target} failed:`, error.message);
    return false;
  }
}

// Line 215: Execute DN step - async fire and forget  
async function executeDNStep(step, payload) {
  const memberUrl = targetRegistry[step.target];
  const dnInstanceId = payload.dnInstanceId;
  
  // Line 220: Check DN instance availability
  const dnStatus = memberStatus.get(dnInstanceId);
  if (dnStatus !== 'ready') {
    console.log(`→ DN instance ${dnInstanceId} not ready (${dnStatus})`);
    return false;
  }
  
  console.log(`→ Sending to DN ${step.target}: ${step.intention}`);
  
  try {
    // Line 229: Send to DN - expect immediate sync response
    const response = await axios.post(`${memberUrl}/execute`, payload);
    
    if (response.data.status === 'accepted') {
      // Line 233: Mark DN as busy - it will emit back when done
      memberStatus.set(dnInstanceId, 'busy');
      console.log(`  DN ${step.target} accepted work - will emit when complete`);
      return true;
    } else {
      console.log(`  DN ${step.target} rejected work: ${response.data.status}`);
      return false;
    }
    
  } catch (error) {
    console.error(`DN ${step.target} failed:`, error.message);
    return false;
  }
}

// Line 246: Execute final step - console output
function executeFinalStep(step, signal) {
  console.log(`\n🎉 === FINAL RESULT ===`);
  console.log(`Intention: ${step.intention}`);
  console.log(`Signal:`, signal);
  console.log(`✅ CPUX License Generation Complete!`);
  
  return true;
}

// Line 255: CPUX endpoint to receive DN emissions
// CPUX endpoint to receive DN and Object emissions
app.post('/cpux/intention', async (req, res) => {
  const { cpuxId, intention, signal, dnInstanceId, objectInstanceId, source } = req.body;
  
  console.log(`\n=== ${source === 'O1' ? 'Object' : 'DN'} Emission Received ===`);
  
  // FIXED: Handle both DN and Object instance IDs
  const instanceId = dnInstanceId || objectInstanceId || 'unknown';
  console.log(`From: ${instanceId}`);
  console.log(`Intention: ${intention}`);
  console.log(`Signal:`, signal.map(p => `${p.name}:${p.TV}`));
  
  // Verify context
  if (cpuxId !== CPUX_CONTEXT_ID) {
    return res.status(400).json({ error: 'Wrong CPUX context' });
  }
  
  // Absorb signal into field
  cpuxField = fieldAbsorb(signal, cpuxField);
  console.log(`Field updated:`, Object.keys(cpuxField));
  
  // Mark DN as ready if it's a DN emission
  if (dnInstanceId) {
    memberStatus.set(dnInstanceId, 'ready');
    console.log(`DN ${dnInstanceId} marked as ready`);
  }
  
  // Note: Object emissions don't need status tracking since they're immediate
  if (objectInstanceId) {
    console.log(`Object emission from ${objectInstanceId} processed`);
  }
  
  // Execute another sequence pass - new pulses may enable new steps
  console.log(`\n--- Triggered by ${source === 'O1' ? 'Object' : 'DN'} emission ---`);
  const activations = await executeSequencePass(CPUXDefinition.sequence);
  
  if (activations === 0) {
    console.log("No new activations - CPUX may be complete");
    checkCompletion();
  }
  
  res.json({ 
    status: 'received',
    message: `Absorbed ${signal.length} pulses, triggered ${activations} activations`,
    contextId: CPUX_CONTEXT_ID,
    sourceType: source === 'O1' ? 'object' : 'dn',
    instanceId: instanceId
  });
});

// Line 291: Check if CPUX is complete
function checkCompletion() {
  const totalSteps = CPUXDefinition.sequence.length;
  const completedSteps = executionLog.size;
  
  console.log(`\n=== Completion Check ===`);
  console.log(`Completed: ${completedSteps}/${totalSteps} steps`);
  console.log(`Executed: ${Array.from(executionLog)}`);
  
  if (completedSteps >= totalSteps) {
    console.log(`\n🎉 === CPUX COMPLETED SUCCESSFULLY ===`);
    console.log(`All ${totalSteps} steps executed`);
    console.log(`Final field:`, cpuxField);
    
    // Could emit completion event here if needed
    return true;
  }
  
  return false;
}

// Line 308: Status endpoint for monitoring
app.get('/cpux/status', (req, res) => {
  const totalSteps = CPUXDefinition.sequence.length;
  const completedSteps = executionLog.size;
  
  res.json({
    contextId: CPUX_CONTEXT_ID,
    completion: {
      completed: completedSteps,
      total: totalSteps,
      percentage: Math.round((completedSteps / totalSteps) * 100)
    },
    fieldState: Object.keys(cpuxField),
    executedSteps: Array.from(executionLog),
    dnStatus: Object.fromEntries(memberStatus)
  });
});

// Line 324: Field endpoint for debugging
app.get('/cpux/field', (req, res) => {
  res.json({
    field: cpuxField,
    pulseCount: Object.keys(cpuxField).length,
    pulses: Object.keys(cpuxField).map(name => ({
      name,
      TV: cpuxField[name].TV,
      hasResponse: !!cpuxField[name].response
    }))
  });
});

// Line 337: Start CPUX server
app.listen(CPUX_PORT, () => {
  console.log(`🚀 Clean CPUX Server running on port ${CPUX_PORT}`);
  console.log(`Context ID: ${CPUX_CONTEXT_ID}`);
  console.log(`Ready to receive DN emissions at /cpux/intention`);
  
  // Line 343: Start CPUX execution
  setTimeout(() => {
    console.log("\nStarting CPUX execution...");
    executeCPUX(CPUXDefinition).catch(console.error);
  }, 1000);
});

module.exports = {
  executeCPUX,
  CPUXDefinition,
  fieldAbsorb,
  fieldMatch
};