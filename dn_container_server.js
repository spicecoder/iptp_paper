// dn-container-server.js
// Unified DN server handling all DN logic using DN container registry

const express = require('express');
const app = express();
app.use(express.json());

const PORT = 5001;
let resultStore = {}; // Map cpuxId:sequenceIndex => result

const DN_CONTAINERS = {
  DN1: {
    valve: [{ name: "start_license_request", TV: "Y" }],
    handler: () => [
      { name: "personal_detail", TV: "Y", response: { name: "Alice", age: 24, fine_flag: "Y" } }
    ]
  },
  DN2: {
    valve: [{ name: "personal_detail", TV: "Y" }],
    handler: () => [
      { name: "driver_points", TV: "Y", response: 3 }
    ]
  },
  DN3: {
    valve: [{ name: "driver_points", TV: "Y" }],
    handler: () => [
      { name: "expiry_date", TV: "Y", response: "2028-06-30" }
    ]
  },
  DN4: {
    valve: [{ name: "expiry_date", TV: "Y" }],
    handler: () => [
      { name: "compiled_license", TV: "Y", response: { id: "LIC12345", issueDate: "2025-06-27" } }
    ]
  },
  DN5: {
    valve: [{ name: "fine_flag", TV: "Y" }],
    handler: () => [
      { name: "fine_notice", TV: "Y", response: { amount: 100, reason: "Pending fine" } }
    ]
  }
};

app.post('/execute', (req, res) => {
  const { cpuxId, sequenceIndex, intention, target } = req.body;
  console.log(`\n[${target}] Executing '${intention}' via DN container.`);
  const container = DN_CONTAINERS[target];
  if (!container) {
    console.error(`Unknown DN: ${target}`);
    return res.status(400).json({ error: "Unknown DN" });
  }
  const signal = container.handler();
  resultStore[`${cpuxId}:${sequenceIndex}`] = { signal };
  res.json({ status: "executed" });
});

app.post('/ready', (req, res) => {
  const key = `${req.body.cpuxId}:${req.body.sequenceIndex}`;
  res.json({ ready: !!resultStore[key] });
});

app.post('/result', (req, res) => {
  const key = `${req.body.cpuxId}:${req.body.sequenceIndex}`;
  const result = resultStore[key];
  delete resultStore[key];
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`🟢 DN Container Server running on port ${PORT}`);
});
