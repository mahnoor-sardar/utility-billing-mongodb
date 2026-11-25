const d = db.getSiblingDB('utility_billing');
const out = {};
d.getCollectionNames().filter(c => !c.startsWith('system') && c !== 'v_consumer_bills').sort()
  .forEach(c => { out[c] = d.getCollection(c).countDocuments(); });
print(JSON.stringify(out));
