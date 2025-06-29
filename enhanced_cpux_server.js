// enhanced-cpux-server.js
// CPUX server that implements proper field-gated execution semantics
// with line number annotations for documentation cross-reference

const axios = require('axios');
const express = require('express');
// Line 3: Import field operations - fieldMatch might not exist in utils yet
// const { fieldAbsorb, fieldMatch } = require('./utils/field');

// Line 6: Express server to receive DN emissions
const app = express();
app.use(express.json());
const CPUX_PORT = 3000;

// Line 10: CPUX runtime state management with context identification
let cpuxField = {}; // The semantic field of the CPUX instance
let executionLog = new Set(); // Track completed intentions to avoid duplicates
let memberStatus = new Map(); // Track DN instance execution states: 'ready', 'busy', 'stopped'
let cpuxActive = true; // Controls the main CPUX loop

// Line 15: Context identification for this CPUX instance
const CPUX_CONTEXT_ID = `CPUX_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
console.log(`Line 17: CPUX Context ID: ${CPUX_CONTEXT_ID}`);

// Line 15: Service registry for routing intentions
const targetRegistry = {
  O1: "http://localhost:4000",
  DN1: "http://localhost:5001", 
  DN2: "http://localhost:5001",
  DN3: "http://localhost:5001",
  DN4: "http://localhost:5001",
  DN5: "http://localhost:5001"
};

// Line 25: CPUX Definition with proper sequence structure
const CPUXDefinition = {
  cpuxId: "make_license_cpux",
  // Line 27: Initial intention that creates the field (Rule: CPUX starts with i1)
  startIntention: {
    name: "start_license_request",
    signal: [{ name: "start_license_request", TV: "Y", response: "initiated" }],
    target: "O1"
  },
  // Line 33: Sequential members following I-O-I-DN pattern (no DN-I-DN allowed)
  sequence: [
    {
      stepId: 1,
      type: "intention-to-object", // I -> O
      intention: "add_personal_detail",
      designTimeSignal: [{ name: "start_license_request", TV: "Y" }], // Required field state
      source: "CPUX",
      target: "O1",
      consumeSignal: false, // Signal remains in CPUX field (copy behavior)
      targetConsumption: 'copy' // Object gets copy, doesn't "suck away" from CPUX
    },
    {
      stepId: 2, 
      type: "object-reflection", // O -> I -> DN (Object reflects when triggered)
      intention: "fetch_personal_detail",
      designTimeSignal: [{ name: "start_license_request", TV: "Y" }],
      source: "O1",
      target: "DN1",
      consumeSignal: false, // Keep signal available for DN1 processing
      targetConsumption: 'copy' // DN1 gets copy of signal
    },
    {
      stepId: 3,
      type: "dn-emission", // DN -> I -> O (DN emits result)
      intention: "reflect_personal_detail", 
      designTimeSignal: [{ name: "personal_detail", TV: "Y" }],
      source: "DN1",
      target: "O1",
      consumeSignal: false, // New signal stays in CPUX field
      targetConsumption: 'copy' // Object gets copy of new signal
    },
    {
      stepId: 4,
      type: "intention-to-object",
      intention: "fetch_driver_points",
      designTimeSignal: [{ name: "personal_detail", TV: "Y" }],
      source: "O1", 
      target: "DN2",
      consumeSignal: true, // Signal consumed by DN2 (default "suck in" behavior)
      targetConsumption: 'absorb'
    },
    {
      stepId: 5,
      type: "dn-emission",
      intention: "reflect_driver_points",
      designTimeSignal: [{ name: "driver_points", TV: "Y" }],
      source: "DN2",
      target: "O1", 
      consumeSignal: false, // Signal remains available in CPUX field
      targetConsumption: 'copy'
    },
    {
      stepId: 6,
      type: "intention-to-object", 
      intention: "compute_expiry",
      designTimeSignal: [{ name: "driver_points", TV: "Y" }],
      source: "O1",
      target: "DN3",
      consumeSignal: true, // Default consumption behavior
      targetConsumption: 'absorb'
    },
    {
      stepId: 7,
      type: "dn-emission",
      intention: "reflect_expiry", 
      designTimeSignal: [{ name: "expiry_date", TV: "Y" }],
      source: "DN3",
      target: "O1",
      consumeSignal: false, // Keep signal available for next step
      targetConsumption: 'copy'
    },
    {
      stepId: 8,
      type: "intention-to-object",
      intention: "generate_license",
      designTimeSignal: [{ name: "expiry_date", TV: "Y" }],
      source: "O1", 
      target: "DN4",
      consumeSignal: true, // Final consumption of signal
      targetConsumption: 'absorb'
    },
    {
      stepId: 9,
      type: "final-emission", // Last member emission back to starter
      intention: "license_complete",
      designTimeSignal: [{ name: "compiled_license", TV: "Y" }],
      source: "DN4",
      target: "STARTER", // Back to initiating system
      consumeSignal: false, // Final result remains in field
      targetConsumption: 'copy'
    }
  ]
};

// Line 95: Utility functions for CPUX progression
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Line 100: Check if design-time signal matches current field state
function checkSignalMatch(designTimeSignal, currentField) {
  return fieldMatch(currentField, designTimeSignal);
}

// Line 105: Enhanced field matching function
function fieldMatch(field, requiredSignal) {
  console.log("Line 107: FieldMatch called");
  console.log("Line 108: Required signal:", requiredSignal.map(p => `${p.name}:${p.TV}`));
  console.log("Line 109: Current field pulses:", Object.keys(field).map(name => 
    `${name}:${field[name]?.TV || 'undefined'}`));
  
  // Line 112: Check each required pulse
  for (const requiredPulse of requiredSignal) {
    const fieldPulse = field[requiredPulse.name];
    
    // Line 116: Pulse must exist in field
    if (!fieldPulse) {
      console.log(`Line 118: MATCH FAILED - Pulse '${requiredPulse.name}' not found in field`);
      return false;
    }
    
    // Line 122: TV state must match exactly
    if (fieldPulse.TV !== requiredPulse.TV) {
      console.log(`Line 124: MATCH FAILED - Pulse '${requiredPulse.name}' TV mismatch. Required: ${requiredPulse.TV}, Found: ${fieldPulse.TV}`);
      return false;
    }
    
    console.log(`Line 128: MATCH SUCCESS - Pulse '${requiredPulse.name}' matches ${requiredPulse.TV}`);
  }
  
  console.log("Line 131: All required pulses match - FIELD MATCH SUCCESS");
  return true;
}

// Line 135: Enhanced field absorption function
function fieldAbsorb(incomingSignal, currentField, consume = true) {
  console.log("Line 137: FieldAbsorb called");
  console.log("Line 138: Incoming signal:", incomingSignal);
  console.log("Line 139: Current field before absorption:", Object.keys(currentField));
  console.log("Line 140: Consume flag:", consume);
  
  const updatedField = { ...currentField };
  
  // Line 144: Process each pulse in the incoming signal
  for (const incomingPulse of incomingSignal) {
    const pulseName = incomingPulse.name;
    
    // Line 148: Check if pulse already exists in field
    if (updatedField[pulseName]) {
      console.log(`Line 150: Updating existing pulse: ${pulseName}`);
      
      // Line 152: Update TV state (latest wins)
      updatedField[pulseName].TV = incomingPulse.TV;
      
      // Line 155: Handle response merging
      if (incomingPulse.response !== undefined) {
        if (consume) {
          // Line 158: Replace response when consuming
          updatedField[pulseName].response = incomingPulse.response;
        } else {
          // Line 161: Merge or accumulate responses when not consuming
          if (Array.isArray(updatedField[pulseName].response)) {
            updatedField[pulseName].response.push(incomingPulse.response);
          } else if (updatedField[pulseName].response) {
            updatedField[pulseName].response = [
              updatedField[pulseName].response,
              incomingPulse.response
            ];
          } else {
            updatedField[pulseName].response = incomingPulse.response;
          }
        }
      }
    } else {
      console.log(`Line 175: Adding new pulse: ${pulseName}`);
      
      // Line 177: Add new pulse to field
      updatedField[pulseName] = {
        name: pulseName,
        TV: incomingPulse.TV,
        response: incomingPulse.response || null,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  console.log("Line 186: Field after absorption:", Object.keys(updatedField));
  return updatedField;
}

// Line 105: Initialize member status tracking
function initializeMemberStatus(sequence) {
  sequence.forEach(step => {
    if (step.target.startsWith('DN')) {
      memberStatus.set(step.target, 'ready');
    }
  });

// Line 385: Enhanced field utilities that should be in utils/field.js
function fieldMatch(field, requiredSignal) {
  // Check if all required pulses exist in field with correct TV values
  return requiredSignal.every(requiredPulse => {
    const fieldPulse = field[requiredPulse.name];
    return fieldPulse && fieldPulse.TV === requiredPulse.TV;
  });
}

// Line 395: Export for module use
module.exports = {
  runCPUX,
  CPUXDefinition,
  fieldMatch
};
}

// Line 115: Main CPUX execution loop implementing field-gated progression
async function runCPUX(cpuxDef) {
  const { cpuxId, startIntention, sequence } = cpuxDef;
  
  console.log(`\n=== CPUX ${cpuxId} Starting ===`);
  console.log("Line 120: Initial field creation from start intention");
  
  // Line 122: Rule 1 - CPUX starts with i1 creating the field
  cpuxField = fieldAbsorb(startIntention.signal, cpuxField);
  console.log("Field after start intention:", cpuxField);
  
  // Line 210: Initialize DN instance status tracking with context
  initializeMemberStatus(sequence, CPUX_CONTEXT_ID);
  
  let passCount = 0;
  let activationsThisPass = 0;
  
  // Line 131: Main CPUX loop - continues until no DN is executing
  while (cpuxActive) {
    passCount++;
    activationsThisPass = 0;
    
    console.log(`\n--- CPUX Pass ${passCount} ---`);
    console.log("Line 137: Visiting each member left to right");
    
    // Line 139: Rule 2 - Visit each member in sequence from left to right
    for (let i = 0; i < sequence.length; i++) {
      const step = sequence[i];
      const stepKey = `${step.intention}-${step.target}-${step.stepId}`;
      
      console.log(`\nLine 144: Checking step ${step.stepId}: ${step.intention} -> ${step.target}`);
      
      // Line 146: Skip if already executed (avoid duplicates)
      if (executionLog.has(stepKey)) {
        console.log(`Line 148: Step already executed, skipping`);
        continue;
      }
      
      // Line 151: Rule 1 - Check if design-time signal matches field
      const signalMatch = checkSignalMatch(step.designTimeSignal, cpuxField);
      
      if (!signalMatch) {
        console.log(`Line 155: Signal mismatch - Required:`, step.designTimeSignal);
        console.log(`Line 156: Current field:`, Object.keys(cpuxField));
        continue;
      }
      
      console.log(`Line 160: Signal match found! Activating ${step.target}`);
      
      // Line 162: Check DN instance status before activation (Rule 3)
      if (step.target.startsWith('DN')) {
        // Line 164: Create DN instance identifier
        const dnInstanceId = `${CPUX_CONTEXT_ID}:${step.stepId}:${step.target}`;
        const dnStatus = memberStatus.get(dnInstanceId);
        
        console.log(`Line 168: Checking DN instance: ${dnInstanceId}, Status: ${dnStatus}`);
        
        if (dnStatus === 'busy') {
          console.log(`Line 171: DN instance ${dnInstanceId} still busy, skipping`);
          continue;
        }
        if (dnStatus === 'stopped') {
          console.log(`Line 175: DN instance ${dnInstanceId} stopped, skipping`);
          continue;
        }
      }
      
      // Line 178: Prepare IPTP message for member activation with context identification
      // Rule 2b: Signal is "sucked into" target by default, unless configured otherwise
      const signalToSend = step.designTimeSignal.map(pulse => ({
        ...pulse,
        // Include any response data from CPUX field if available
        response: cpuxField[pulse.name]?.response || pulse.response
      }));
      
      const payload = {
        cpuxId: CPUX_CONTEXT_ID, // Use context ID for this CPUX instance
        stepId: step.stepId,
        intention: step.intention,
        signal: signalToSend, // Send the enriched signal from CPUX field
        source: step.source,
        target: step.target,
        consumeSignal: step.consumeSignal, // Controls if signal is removed from CPUX field
        targetConsumption: step.targetConsumption || 'absorb', // 'absorb' or 'copy'
        // Line 193: Add DN instance identification for server tracking
        dnInstanceId: step.target.startsWith('DN') ? `${CPUX_CONTEXT_ID}:${step.stepId}:${step.target}` : null
      };
      
      try {
        const memberUrl = targetRegistry[step.target];
        
        // Line 188: Send intention to target member
        console.log(`Line 189: Sending intention to ${memberUrl}`);
        await axios.post(`${memberUrl}/execute`, payload);
        
        activationsThisPass++;
        
        // Line 194: Rule 3 - Wait for DN progress synchronously
        if (step.target.startsWith('DN')) {
          memberStatus.set(step.target, 'executing');
          console.log(`Line 197: DN ${step.target} set to executing, waiting for completion`);
          
          // Line 199: Handle signal consumption from CPUX field (Rule 2b)
          if (step.consumeSignal) {
            console.log(`Line 201: Signal consumed from CPUX field - removing from field`);
            // Remove signal from CPUX field since it was "sucked into" the DN
            for (const pulse of step.designTimeSignal) {
              if (cpuxField[pulse.name]) {
                delete cpuxField[pulse.name];
              }
            }
          } else {
            console.log(`Line 208: Signal copied to DN - remaining in CPUX field`);
          }
          
          // Line 199: Synchronous wait for DN completion
          let dnReady = false;
          let waitCount = 0;
        //  const maxWait = 30; // 30 second timeout
          
          // Line 211: Synchronous wait for DN completion
          const maxWait = 30; // 30 second timeout
          let dnCompleted = false;
          let dnWaitCount = 0;
          
          while (!dnCompleted && dnWaitCount < maxWait) {
            try {
              const statusResponse = await axios.post(`${memberUrl}/ready`, {
                cpuxId,
                stepId: step.stepId
              });
              dnCompleted = statusResponse.data.ready;
              
              if (!dnCompleted) {
                console.log(`Line 224: DN ${step.target} not ready, waiting...`);
                await sleep(1000);
                dnWaitCount++;
              }
            } catch (error) {
              console.error(`Line 229: Error checking DN status:`, error.message);
              break;
            }
          }
          
          if (dnReady) {
            // Line 223: Get result and absorb into field
            try {
              const resultResponse = await axios.post(`${memberUrl}/result`, {
                cpuxId,
                stepId: step.stepId
              });
              
              const emittedSignal = resultResponse.data.signal;
              console.log(`Line 231: DN ${step.target} emitted signal:`, emittedSignal);
              
              // Line 233: Absorb emitted signal into CPUX field
              cpuxField = fieldAbsorb(emittedSignal, cpuxField, step.consumeSignal !== false);
              
              memberStatus.set(step.target, 'ready'); // Reset for next activation
              executionLog.add(stepKey); // Mark as completed
              
              console.log(`Line 239: Field updated after DN emission:`, Object.keys(cpuxField));
              
            } catch (error) {
              console.error(`Line 242: Error getting DN result:`, error.message);
              memberStatus.set(step.target, 'stopped');
            }
          } else {
            console.log(`Line 246: DN ${step.target} timeout, marking as stopped`);
            memberStatus.set(step.target, 'stopped');
          }
        } else {
          // Line 262: Object handling 
          console.log(`Line 263: Object ${step.target} activated`);
          
          // Line 265: Handle signal consumption for Objects (Rule 2b)
          if (step.consumeSignal) {
            console.log(`Line 267: Signal consumed from CPUX field by Object`);
            // Remove signal from CPUX field since it was "sucked into" the Object
            for (const pulse of step.designTimeSignal) {
              if (cpuxField[pulse.name]) {
                delete cpuxField[pulse.name];
              }
            }
          } else {
            console.log(`Line 274: Signal copied to Object - remaining in CPUX field`);
          }
          
          executionLog.add(stepKey);
        }
        
      } catch (error) {
        console.error(`Line 256: Error activating ${step.target}:`, error.message);
      }
    }
    
    // Line 290: Rule 4 - Check termination conditions
    console.log(`\nLine 291: Pass ${passCount} complete. Activations: ${activationsThisPass}`);
    
    // Line 293: Check if any DN is still busy
    const busyDNs = Array.from(memberStatus.entries())
      .filter(([dnInstanceId, status]) => status === 'busy')
      .map(([dnInstanceId, status]) => dnInstanceId);
      
    const readyDNs = Array.from(memberStatus.entries())
      .filter(([dnInstanceId, status]) => status === 'ready')
      .map(([dnInstanceId, status]) => dnInstanceId);
    
    console.log(`Line 302: Busy DN instances: ${busyDNs.join(', ') || 'none'}`);
    console.log(`Line 303: Ready DN instances: ${readyDNs.join(', ') || 'none'}`);
    
    // Line 305: Enhanced termination logic - wait for busy DNs and late emissions
    if (busyDNs.length > 0) {
      console.log(`Line 307: DN instances still working, continuing loop (they will emit when done)`);
      console.log(`Line 308: Busy instances: ${busyDNs.join(', ')}`);
      await sleep(2000); // Brief pause before next pass to allow DN emissions
      continue;
    }
    
    // Line 312: Check if we're in early termination - give more time for late emissions
    if (activationsThisPass === 0 && passCount <= 3) {
      console.log(`Line 314: No activations this pass (${passCount}), but waiting for potential late emissions...`);
      await sleep(3000); // Wait longer for late DN emissions
      continue;
    }
    
    // Line 318: Check if we have any DN instances that might still emit
    const stoppedDNs = Array.from(memberStatus.entries())
      .filter(([dnInstanceId, status]) => status === 'stopped')
      .map(([dnInstanceId, status]) => dnInstanceId);
    
    if (stoppedDNs.length > 0 && passCount <= 5) {
      console.log(`Line 325: Some DNs stopped, but waiting for late emissions: ${stoppedDNs.join(', ')}`);
      await sleep(2000);
      continue;
    }
    
    if (readyDNs.length === 0) {
      console.log(`Line 331: No DN instances ready, terminating CPUX`);
      cpuxActive = false;
      break;
    }
    
    if (activationsThisPass === 0) {
      console.log(`Line 319: No activations this pass, checking field conditions`);
      
      // Line 321: Check if any ready DN instance can be activated with current field
      let possibleActivations = 0;
      
      for (const step of sequence) {
        if (step.target.startsWith('DN')) {
          const dnInstanceId = `${CPUX_CONTEXT_ID}:${step.stepId}:${step.target}`;
          const instanceStatus = memberStatus.get(dnInstanceId);
          const stepKey = `${step.intention}-${step.target}-${step.stepId}`;
          
          if (instanceStatus === 'ready' &&
              !executionLog.has(stepKey) &&
              checkSignalMatch(step.designTimeSignal, cpuxField)) {
            possibleActivations++;
          }
        }
      }
      
      if (possibleActivations === 0) {
        console.log(`Line 338: No possible activations with current field, terminating`);
        cpuxActive = false;
      } else {
        console.log(`Line 341: Found ${possibleActivations} possible activations, continuing`);
      }
    }
    
    // Line 311: Prevent infinite loops
    if (passCount > 100) {
      console.log(`Line 313: Maximum passes reached, terminating`);
      cpuxActive = false;
    }
  }
  
  // Line 318: CPUX completion
  console.log(`\n=== CPUX ${cpuxId} Completed ===`);
  console.log("Line 320: Final field state:", cpuxField);
  console.log("Line 321: Executed steps:", Array.from(executionLog));
  console.log("Line 322: Final DN status:", Object.fromEntries(memberStatus));
}

// Line 418: Enhanced CPUX server endpoint to receive DN emissions with signal consumption
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

// Line 365: Status endpoint for monitoring
app.get('/cpux/status', (req, res) => {
  res.json({
    cpuxActive,
    fieldState: Object.keys(cpuxField),
    memberStatus: Object.fromEntries(memberStatus),
    executedSteps: Array.from(executionLog)
  });
});

// Line 375: Start CPUX server
app.listen(CPUX_PORT, () => {
  console.log(`Line 377: CPUX Server listening on port ${CPUX_PORT}`);
  console.log(`Line 378: Ready to receive DN emissions at /cpux/intention`);
  
  // Line 380: Start CPUX execution after server is ready
  setTimeout(() => {
    console.log("Line 382: Starting CPUX execution");
    runCPUX(CPUXDefinition).catch(console.error);
  }, 1000);
});