// cpux-server.js
// CPUX server that executes a CPUX definition using IPTP-based message routing with async support and consumeSignal

const axios = require('axios');
const { fieldAbsorb } = require('./utils/field');

let field = {}; // The semantic field of the CPUX instance
let executionLog = new Set();
const targetRegistry = {
  O1: "http://localhost:4000",
  DN1: "http://localhost:5001",
  DN2: "http://localhost:5001",
  DN3: "http://localhost:5001",
  DN4: "http://localhost:5001",
  DN5: "http://localhost:5001"
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const CPUXDefinition = {
  cpuxId: "make_license_cpux",
  startIntention: {
    name: "start_license_request",
    signal: [{ name: "start_license_request", TV: "Y" }],
    target: "O1"
  },
  sequence: [
    {
      intention: "add_personal_detail",
      signal: [{ name: "start_license_request", TV: "Y" }],
      source: "O1",
      target: "DN1",
      consumeSignal: true
    },
    {
      intention: "reflect_personal_detail",
      signal: [{ name: "personal_detail", TV: "Y" }],
      source: "DN1",
      target: "O1"
    },
    {
      intention: "fetch_driver_points",
      signal: [{ name: "personal_detail", TV: "Y" }],
      source: "O1",
      target: "DN2",
      consumeSignal: true
    },
    {
      intention: "reflect_driver_points",
      signal: [{ name: "driver_points", TV: "Y" }],
      source: "DN2",
      target: "O1"
    },
    {
      intention: "compute_expiry",
      signal: [{ name: "driver_points", TV: "Y" }],
      source: "O1",
      target: "DN3",
      consumeSignal: true
    },
    {
      intention: "reflect_expiry",
      signal: [{ name: "expiry_date", TV: "Y" }],
      source: "DN3",
      target: "O1"
    },
    {
      intention: "generate_license",
      signal: [{ name: "expiry_date", TV: "Y" }],
      source: "O1",
      target: "DN4",
      consumeSignal: true
    },
    {
      intention: "check_fine",
      signal: [{ name: "fine_flag", TV: "Y" }],
      source: "O1",
      target: "DN5",
      consumeSignal: false
    }
  ]
};

async function runCPUX(cpuxDef) {
  const { cpuxId, startIntention, sequence } = cpuxDef;
  console.log("\n--- Starting CPUX:", cpuxId, "---\n");

  field = fieldAbsorb(startIntention.signal, field);

  for (let i = 0; i < sequence.length; i++) {
    const step = sequence[i];

    if (executionLog.has(`${step.intention}`)) continue;

    const signalMatch = step.signal.every(p => field[p.name]?.TV === p.TV);
    if (!signalMatch) continue;

    const payload = {
      cpuxId,
      sequenceIndex: i,
      intention: step.intention,
      signal: step.signal,
      source: step.source,
      target: step.target
    };

    const memberUrl = targetRegistry[step.target];

    await axios.post(`${memberUrl}/execute`, payload);

    let ready = false;
    while (!ready) {
      const status = await axios.post(`${memberUrl}/ready`, {
        cpuxId,
        sequenceIndex: i
      });
      ready = status.data.ready;
      if (!ready) await sleep(1000);
    }

    const result = await axios.post(`${memberUrl}/result`, {
      cpuxId,
      sequenceIndex: i
    });

    const emittedSignal = result.data.signal;
    field = fieldAbsorb(emittedSignal, field, step.consumeSignal !== false);
    executionLog.add(step.intention);
    console.log(`\n[Step ${i}] Intention '${step.intention}' executed. Field updated.`);
  }

  console.log("\n--- Final Field State ---\n", field);
}

// Run the CPUX
runCPUX(CPUXDefinition);
