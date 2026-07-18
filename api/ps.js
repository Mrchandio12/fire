const express = require('express');
const axios   = require('axios');
const https   = require('https');
const app     = express();
const PORT    = process.env.PORT || 3000;

const API_URL = "https://pscall.net/restapi/smsreport";
const API_KEY = "SFNYSj1SS16DgYdyf4KIgA==";
const agent   = new https.Agent({ rejectUnauthorized: false });

// ===================== COUNTRY CODES =====================
const COUNTRY_CODES = {
  "1":"USA/Canada","7":"Russia","20":"Egypt","27":"South Africa",
  "30":"Greece","31":"Netherlands","32":"Belgium","33":"France","34":"Spain",
  "36":"Hungary","39":"Italy","40":"Romania","41":"Switzerland","43":"Austria",
  "44":"UK","45":"Denmark","46":"Sweden","47":"Norway","48":"Poland","49":"Germany",
  "51":"Peru","52":"Mexico","54":"Argentina","55":"Brazil","56":"Chile",
  "57":"Colombia","58":"Venezuela","60":"Malaysia","61":"Australia",
  "62":"Indonesia","63":"Philippines","64":"New Zealand","65":"Singapore",
  "66":"Thailand","81":"Japan","82":"South Korea","84":"Vietnam","86":"China",
  "90":"Turkey","91":"India","92":"Pakistan","93":"Afghanistan",
  "94":"Sri Lanka","95":"Myanmar","98":"Iran",
  "212":"Morocco","213":"Algeria","216":"Tunisia","218":"Libya",
  "220":"Gambia","221":"Senegal","222":"Mauritania","223":"Mali",
  "224":"Guinea","225":"Ivory Coast","226":"Burkina Faso","227":"Niger",
  "228":"Togo","229":"Benin","231":"Liberia","232":"Sierra Leone",
  "233":"Ghana","234":"Nigeria","235":"Chad","237":"Cameroon",
  "244":"Angola","249":"Sudan","250":"Rwanda","251":"Ethiopia",
  "252":"Somalia","254":"Kenya","255":"Tanzania","256":"Uganda",
  "258":"Mozambique","260":"Zambia","263":"Zimbabwe","264":"Namibia",
  "351":"Portugal","353":"Ireland","358":"Finland","359":"Bulgaria",
  "370":"Lithuania","371":"Latvia","372":"Estonia","373":"Moldova",
  "374":"Armenia","375":"Belarus","380":"Ukraine","381":"Serbia",
  "385":"Croatia","386":"Slovenia","420":"Czech Republic","421":"Slovakia",
  "502":"Guatemala","503":"El Salvador","504":"Honduras","505":"Nicaragua",
  "506":"Costa Rica","507":"Panama","509":"Haiti","591":"Bolivia",
  "593":"Ecuador","595":"Paraguay","598":"Uruguay",
  "852":"Hong Kong","855":"Cambodia","880":"Bangladesh","886":"Taiwan",
  "961":"Lebanon","962":"Jordan","963":"Syria","964":"Iraq",
  "965":"Kuwait","966":"Saudi Arabia","967":"Yemen","968":"Oman",
  "971":"UAE","972":"Israel","973":"Bahrain","974":"Qatar",
  "992":"Tajikistan","994":"Azerbaijan","995":"Georgia",
  "996":"Kyrgyzstan","998":"Uzbekistan",
};

function getCountry(n) {
  const d = String(n).replace(/\D/g, "");
  for (let l = 4; l >= 1; l--) {
    const p = d.substring(0, l);
    if (COUNTRY_CODES[p]) return COUNTRY_CODES[p];
  }
  return "Unknown";
}

// ===================== CACHE =====================
// Only keep last 10 SMS IDs in memory, reset at midnight
const MAX_SEEN = 10;
let seenIds  = [];   // array (not Set) so we can limit to last 10
let smsData  = [];   // last 10 SMS entries
let lastDate = new Date().toDateString(); // track current date

function resetIfNewDay() {
  const today = new Date().toDateString();
  if (today !== lastDate) {
    seenIds  = [];
    smsData  = [];
    lastDate = today;
    console.log(`🔄 New day (${today}) — cache reset`);
  }
}

function addSeen(id) {
  if (seenIds.includes(id)) return false;   // already seen
  seenIds.push(id);
  if (seenIds.length > MAX_SEEN) seenIds.shift();  // remove oldest
  return true;  // new
}

// ===================== FETCH SMS =====================
async function fetchSMS() {
  resetIfNewDay();

  const resp = await axios.get(API_URL, {
    params: { key: API_KEY, start: 0, length: 50 },
    timeout: 15000,
    httpsAgent: agent,
    validateStatus: () => true,
  });

  let raw = resp.data;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return; }
  }
  if (raw.result !== 'success') return;

  const items = raw.data || [];
  for (const item of items) {
    const date    = String(item.dateadded || "");
    const number  = String(item.num       || "");
    const sender  = String(item.cli       || "");
    const message = String(item.sms       || "");
    if (!number || !message) continue;

    const id = `${date}|${number}|${message.substring(0, 30)}`;
    if (addSeen(id)) {
      // New SMS — add to front
      smsData.unshift({
        date,
        country: getCountry(number),
        phone:   number,
        number:  number,
        sender,
        from:    sender,
        service: sender,
        message,
        msg:     message,
        text:    message,
      });
      // Keep only last 10 SMS in memory
      if (smsData.length > MAX_SEEN) smsData.pop();
    }
  }
}

// ===================== POLLER (every 10s) =====================
async function poll() {
  try {
    await fetchSMS();
    console.log(`✅ SMS in memory: ${smsData.length} | seenIds: ${seenIds.length}`);
  } catch(e) {
    console.warn("❌ Poll error:", e.message);
  }
}

void poll();
setInterval(poll, 10000);

// Reset at midnight (check every minute)
setInterval(() => { resetIfNewDay(); }, 60000);

// ===================== ROUTES =====================
app.get('/api', (req, res) => {
  const { type } = req.query;
  if (type === 'sms' || !type) {
    return res.json({
      sEcho:                1,
      iTotalRecords:        smsData.length,
      iTotalDisplayRecords: smsData.length,
      aaData:               smsData
    });
  }
  if (type === 'new-sms') {
    // Return all current data (already filtered to last 10 new ones)
    return res.json({
      newCount: smsData.length,
      newSms:   smsData
    });
  }
  res.status(400).json({ error: "Use ?type=sms or ?type=new-sms" });
});

app.get('/reset', (_, res) => {
  seenIds = []; smsData = [];
  res.json({ ok: true, message: "Cache cleared" });
});

app.get('/', (_, res) => res.json({
  status:  "ok",
  sms:     smsData.length,
  seen:    seenIds.length,
  maxSeen: MAX_SEEN,
  date:    lastDate,
  endpoints: ["/api?type=sms", "/api?type=new-sms", "/reset"]
}));

app.listen(PORT, () => {
  console.log(`Panel7 API on port ${PORT}`);
  console.log(`Max SMS in memory: ${MAX_SEEN}`);
});
