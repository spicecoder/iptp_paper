// utils/field.js

function fieldAbsorb(signal, field, consume = true) {
    const updated = { ...field };
    for (const pulse of signal) {
      if (consume || !updated[pulse.name]) {
        updated[pulse.name] = {
          name: pulse.name,
          TV: pulse.TV,
          response: pulse.response || null
        };
      }
    }
    return updated;
  }
  
  module.exports = { fieldAbsorb };
  