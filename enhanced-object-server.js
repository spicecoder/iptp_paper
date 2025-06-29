// final-corrected-object-server.js
// Object server with proper instance ID and async reflection pattern

const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const PORT = 4000;
const CPUX_SERVER_URL = "http://localhost:3000";

// Object state - accumulates pulses over time
let objectField = {}; // O1's internal semantic field
let activeTriggers = new Set(); // Track which triggers have been activated

// Trigger mappings - define when to emit intentions
const triggerMappings = [
  {
    incomingIntention: "add_personal_detail",
    triggerCondition: [{ name: "start_license_request", TV: "Y" }],
    outgoingIntention: "start_confirmed", 
    target: "CPUX", // Emit back to CPUX for logging
    emitSignal: [{ name: "start_license_request", TV: "Y" }]
  },
  {
    incomingIntention: "reflect_personal_detail", 
    triggerCondition: [{ name: "personal_detail", TV: "Y" }],
    outgoingIntention: "personal_detail_ready",
    target: "CPUX",
    emitSignal: [{ name: "personal_detail", TV: "Y" }]
  },
  {
    incomingIntention: "reflect_driver_points",
    triggerCondition: [{ name: "driver_points", TV: "Y" }], 
    outgoingIntention: "driver_points_ready",
    target: "CPUX",
    emitSignal: [{ name: "driver_points", TV: "Y" }]
  },
  {
    incomingIntention: "reflect_expiry",
    triggerCondition: [{ name: "expiry_date", TV: "Y" }],
    outgoingIntention: "expiry_ready", 
    target: "CPUX",
    emitSignal: [{ name: "expiry_date", TV: "Y" }]
  }
];

// Core field operations
function fieldAbsorb(signal, field) {
  console.log(`[O1] Absorbing ${signal.length} pulse(s) into field`);
  
  for (const pulse of signal) {
    field[pulse.name] = {
      name: pulse.name,
      TV: pulse.TV,
      response: pulse.response || null,
      timestamp: new Date().toISOString()
    };
    console.log(`[O1] Field updated: ${pulse.name} = ${pulse.TV}`);
  }
  
  return field;
}

function fieldMatch(field, condition) {
  return condition.every(requiredPulse => {
    const fieldPulse = field[requiredPulse.name];
    return fieldPulse && fieldPulse.TV === requiredPulse.TV;
  });
}

// Async function to emit intention back to CPUX
async function emitIntentionToCPUX(intention, signal, cpuxId, sourceIntention, objectInstanceId) {
  try {
    console.log(`[O1] Emitting intention: ${intention}`);
    console.log(`[O1] Signal:`, signal.map(p => `${p.name}:${p.TV}`));
    
    const payload = {
      cpuxId: cpuxId,
      intention: intention,
      signal: signal,
      source: 'O1',
      sourceIntention: sourceIntention, // Track what triggered this emission
      objectInstanceId: objectInstanceId // FIXED: Object instance identifier
    };
    
    const response = await axios.post(`${CPUX_SERVER_URL}/cpux/intention`, payload);
    
    console.log(`[O1] Successfully emitted to CPUX: ${intention}`);
    console.log(`[O1] CPUX response:`, response.data);
    
    return true;
    
  } catch (error) {
    console.error(`[O1] Failed to emit intention ${intention}:`, error.message);
    return false;
  }
}

// Main execution endpoint - handles signal accumulation and trigger evaluation
app.post('/execute', async (req, res) => {
  const { cpuxId, stepId, intention, signal, target } = req.body;
  
  console.log(`\n=== O1 Execute Request ===`);
  console.log(`[O1] Intention: ${intention}, CPUX: ${cpuxId}, Step: ${stepId}`);
  console.log(`[O1] Incoming signal:`, signal);
  
  // FIXED: Create object instance ID (similar to DN pattern but for objects)
  const objectInstanceId = `${cpuxId}:${stepId}:O1`;
  
  // Step 1: Absorb incoming signal into field (always)
  objectField = fieldAbsorb(signal, objectField);
  
  console.log(`[O1] Current field state:`, Object.keys(objectField));
  
  // Step 2: Check all trigger mappings for activations
  const triggeredMappings = [];
  
  for (const mapping of triggerMappings) {
    // Only evaluate triggers for the current incoming intention
    if (mapping.incomingIntention !== intention) {
      continue;
    }
    
    // Check if trigger condition is met and hasn't been activated before
    const triggerKey = `${intention}:${mapping.outgoingIntention}`;
    
    if (fieldMatch(objectField, mapping.triggerCondition) && !activeTriggers.has(triggerKey)) {
      console.log(`[O1] Trigger activated: ${mapping.outgoingIntention}`);
      
      // Mark this trigger as activated
      activeTriggers.add(triggerKey);
      
      // Prepare emission signal - include response data from field
      const emissionSignal = mapping.emitSignal.map(pulseSpec => {
        const fieldPulse = objectField[pulseSpec.name];
        return {
          name: pulseSpec.name,
          TV: pulseSpec.TV,
          response: fieldPulse?.response || null
        };
      });
      
      triggeredMappings.push({
        mapping,
        emissionSignal,
        objectInstanceId // FIXED: Include object instance ID
      });
    }
  }
  
  // Step 3: Return immediate sync response (like DN server)
  const responseStatus = triggeredMappings.length > 0 ? 'triggered' : 'absorbed';
  
  res.json({
    status: responseStatus,
    message: `Absorbed ${signal.length} pulse(s), triggered ${triggeredMappings.length} reflection(s)`,
    fieldSize: Object.keys(objectField).length,
    triggeredCount: triggeredMappings.length,
    objectInstanceId: objectInstanceId // FIXED: Return object instance ID
  });
  
  // Step 4: Emit intentions asynchronously (don't await)
  if (triggeredMappings.length > 0) {
    console.log(`[O1] Starting async emission of ${triggeredMappings.length} intention(s)`);
    
    // Emit each triggered intention asynchronously
    for (const { mapping, emissionSignal, objectInstanceId } of triggeredMappings) {
      // Use setTimeout to make truly async (could also use setImmediate)
      setTimeout(async () => {
        await emitIntentionToCPUX(
          mapping.outgoingIntention,
          emissionSignal, 
          cpuxId,
          intention,
          objectInstanceId // FIXED: Pass object instance ID
        );
      }, 100); // Small delay to ensure sync response is sent first
    }
  }
});

// Field state endpoint for debugging
app.get('/field', (req, res) => {
  res.json({
    fieldState: objectField,
    pulseCount: Object.keys(objectField).length,
    activeTriggers: Array.from(activeTriggers),
    pulses: Object.keys(objectField).map(name => ({
      name,
      TV: objectField[name].TV,
      hasResponse: !!objectField[name].response,
      timestamp: objectField[name].timestamp
    }))
  });
});

// Reset endpoint for testing
app.post('/reset', (req, res) => {
  objectField = {};
  activeTriggers.clear();
  
  console.log(`[O1] Object state reset`);
  
  res.json({
    status: 'reset',
    message: 'Object field and triggers cleared'
  });
});

// Trigger mappings endpoint for inspection
app.get('/triggers', (req, res) => {
  res.json({
    mappings: triggerMappings,
    activeTriggers: Array.from(activeTriggers),
    totalMappings: triggerMappings.length
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    server: 'Final Corrected O1 Object Server',
    port: PORT,
    cpuxTarget: CPUX_SERVER_URL,
    fieldSize: Object.keys(objectField).length,
    triggerMappings: triggerMappings.length,
    timestamp: new Date().toISOString()
  });
});

// Start corrected object server
app.listen(PORT, () => {
  console.log(`🟡 Final Corrected O1 Object Server running on port ${PORT}`);
  console.log(`CPUX emission target: ${CPUX_SERVER_URL}/cpux/intention`);
  console.log(`Trigger mappings loaded: ${triggerMappings.length}`);
  console.log(`Field accumulation and async reflection enabled`);
  console.log(`✅ Object instance ID tracking enabled`);
  console.log(`Health check available at /health`);
  console.log(`Field state monitoring at /field`);
});

module.exports = {
  objectField,
  triggerMappings,
  fieldAbsorb,
  fieldMatch,
  emitIntentionToCPUX
};