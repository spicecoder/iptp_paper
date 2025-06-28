// object-server.js
// O1: License Object Server handling field absorption and reflection

const express = require('express');
const app = express();
app.use(express.json());

let objectField = {}; // O1's internal semantic field

const triggerMappings = [
  {
    incomingIntention: "reflect_personal_detail",
    triggerCondition: [{ name: "personal_detail", TV: "Y" }],
    outgoingIntention: "fetch_driver_points",
    target: "DN2"
  },
  {
    incomingIntention: "reflect_driver_points",
    triggerCondition: [{ name: "driver_points", TV: "Y" }],
    outgoingIntention: "compute_expiry",
    target: "DN3"
  },
  {
    incomingIntention: "reflect_expiry",
    triggerCondition: [{ name: "expiry_date", TV: "Y" }],
    outgoingIntention: "generate_license",
    target: "DN4"
  },
  {
    incomingIntention: "generate_license",
    triggerCondition: [{ name: "fine_flag", TV: "Y" }],
    outgoingIntention: "check_fine",
    target: "DN5"
  }
];


function fieldAbsorb(signal, field) {
  for (const pulse of signal) {
    field[pulse.name] = pulse;
  }
  return field;
}

function fieldMatch(field, condition) {
  return condition.every(p => field[p.name]?.TV === p.TV);
}

const resultStore = {};

app.post('/execute', (req, res) => {
  const { cpuxId, sequenceIndex, intention, signal } = req.body;
  objectField = fieldAbsorb(signal, objectField);
  console.log(`\n[O1] Absorbed intention '${intention}' with signal.`);

  const match = triggerMappings.find(m => m.incomingIntention === intention && fieldMatch(objectField, m.triggerCondition));

  if (match) {
    resultStore[`${cpuxId}:${sequenceIndex}`] = {
      signal: match.triggerCondition,
      target: match.target,
      intention: match.outgoingIntention
    };
    console.log(`[O1] Trigger matched. Will reflect intention '${match.outgoingIntention}' to ${match.target}`);
  } else {
    console.log(`[O1] No reflection triggered.`);
  }

  res.json({ status: "ok" });
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

app.listen(4000, () => {
  console.log("🟡 O1 Object Server running on port 4000");
});
