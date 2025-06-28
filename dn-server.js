// dn-server.js
// Generic DN server that executes based on DN ID and reflected intention from CPUX

const express = require('express');
const app = express();
app.use(express.json());

const port = process.env.PORT || 5001; // Use DN-specific port

let resultStore = {}; // Store emitted signal per CPUX cycle

function simulateLogic(dnId, intention) {
  const responses = {
    DN1: [{ name: "personal_detail", TV: "Y", response: { name: "Alice", age: 24 } }],
    DN2: [{ name: "driver_points", TV: "Y", response: 3 }],
    DN3: [{ name: "expiry_date", TV: "Y", response: "2028-06-30" }],
    DN4: [{ name: "compiled_license", TV: "Y", response: { id: "LIC12345", issueDate: "2025-06-27" } }],
    DN5: [{ name: "fine_notice", TV: "Y", response: { amount: 100, reason: "Pending fine" } }]
  };
  return responses[dnId] || [];
}

app.post('/execute', (req, res) => {
  const { cpuxId, sequenceIndex, intention, signal, target } = req.body;
  console.log(`\n[${target}] Executing intention '${intention}'`);
  const responseSignal = simulateLogic(target, intention);
  resultStore[`${cpuxId}:${sequenceIndex}`] = { signal: responseSignal };
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

app.listen(port, () => {
  console.log(`🟢 ${process.env.DN_ID || 'DN'} server running on port ${port}`);
});
