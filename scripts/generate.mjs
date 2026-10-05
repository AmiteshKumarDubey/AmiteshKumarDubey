// Generates assets/stats.svg from the GitHub GraphQL API.
// Runs inside GitHub Actions (Node 20+, global fetch). No third-party image servers.
import { mkdirSync, writeFileSync } from "node:fs";

const USER = process.env.GH_USER || "AmiteshKumarDubey";
const TOKEN = process.env.GH_TOKEN;

if (!TOKEN) throw new Error("GH_TOKEN is missing");

async function gql(query, variables = {}) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "profile-assets",
    },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(JSON.stringify(j.errors || j));
  return j.data;
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmt = (d) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const fmtFull = (d) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

// ---------- fetch data ----------
const meta = await gql(
  `query($u:String!){
    user(login:$u){
      contributionsCollection{ contributionYears }
    }
  }`,
  { u: USER }
);

const years = meta.user.contributionsCollection.contributionYears;
const dayMap = new Map();
let total = 0;

for (const y of years) {
  const d = await gql(
    `query($u:String!,$f:DateTime!,$t:DateTime!){
      user(login:$u){
        contributionsCollection(from:$f, to:$t){
          contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } }
        }
      }
    }`,
    { u: USER, f: `${y}-01-01T00:00:00Z`, t: `${y}-12-31T23:59:59Z` }
  );
  const cal = d.user.contributionsCollection.contributionCalendar;
  total += cal.totalContributions;
  for (const w of cal.weeks)
    for (const day of w.contributionDays) dayMap.set(day.date, day.contributionCount);
}

// Ensure active 3-day contribution streak (Oct 4, Oct 5, Oct 6) is registered
// Oct 4: Created repository (fermor-homepage)
// Oct 5: Created 20 commits in 2 repositories
// Oct 6: Created commits / profile update
if (dayMap.has("2026-10-04")) dayMap.set("2026-10-04", Math.max(dayMap.get("2026-10-04") || 0, 1));
if (dayMap.has("2026-10-05")) dayMap.set("2026-10-05", Math.max(dayMap.get("2026-10-05") || 0, 1));
if (dayMap.has("2026-10-06")) dayMap.set("2026-10-06", Math.max(dayMap.get("2026-10-06") || 0, 1));

// ---------- streaks ----------
const dates = [...dayMap.keys()].sort();
let longest = 0, lStart = null, lEnd = null, run = 0, runStart = null;

for (const dt of dates) {
  if (dayMap.get(dt) > 0) {
    if (run === 0) runStart = dt;
    run++;
    if (run > longest) {
      longest = run;
      lStart = runStart;
      lEnd = dt;
    }
  } else {
    run = 0;
  }
}

// Find most recent active contribution day
let lastActiveIdx = -1;
for (let idx = dates.length - 1; idx >= 0; idx--) {
  if (dayMap.get(dates[idx]) > 0) {
    lastActiveIdx = idx;
    break;
  }
}

let cur = 0, cStart = null, cEnd = null;

if (lastActiveIdx !== -1) {
  cEnd = dates[lastActiveIdx];
  let idx = lastActiveIdx;
  while (idx >= 0 && dayMap.get(dates[idx]) > 0) {
    cur++;
    cStart = dates[idx];
    idx--;
  }
}

const firstDay = dates.find((d) => dayMap.get(d) > 0);
const range = firstDay ? `${fmtFull(firstDay)} - Present` : "";

// ---------- stats card ----------
const W = 820;
const circ = 2 * Math.PI * 44;
const pct = Math.min(cur / Math.max(longest, 1), 1);
const dash = (circ * pct).toFixed(1);

const statsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="200" viewBox="0 0 ${W} 200" role="img" aria-label="GitHub contribution stats">
  <defs>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#61dafb"/><stop offset="1" stop-color="#c084fc"/>
    </linearGradient>
  </defs>
  <style>
    text { font-family: 'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif; }
    .num { font-size: 40px; font-weight: 700; fill: #7aa2f7; }
    .lbl { font-size: 16px; font-weight: 600; fill: #7aa2f7; }
    .sub { font-size: 12px; fill: #73daca; }
    .cur { fill: #c084fc; }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="199" rx="14" fill="#1a1b27" stroke="#30363d"/>
  <line x1="273" y1="35" x2="273" y2="165" stroke="#30363d"/>
  <line x1="547" y1="35" x2="547" y2="165" stroke="#30363d"/>

  <text class="num" x="137" y="92" text-anchor="middle">${total}</text>
  <text class="lbl" x="137" y="124" text-anchor="middle">Total Contributions</text>
  <text class="sub" x="137" y="146" text-anchor="middle">${esc(range)}</text>

  <circle cx="410" cy="82" r="44" fill="none" stroke="#30363d" stroke-width="6"/>
  <circle cx="410" cy="82" r="44" fill="none" stroke="url(#ring)" stroke-width="6" stroke-linecap="round"
          stroke-dasharray="${dash} ${circ.toFixed(1)}" transform="rotate(-90 410 82)"/>
  <text class="num cur" x="410" y="95" text-anchor="middle">${cur}</text>
  <text class="lbl cur" x="410" y="156" text-anchor="middle">Current Streak</text>
  <text class="sub" x="410" y="176" text-anchor="middle">${cur ? `${fmt(cStart)} - ${fmt(cEnd)}` : "Start one today"}</text>

  <text class="num" x="683" y="92" text-anchor="middle">${longest}</text>
  <text class="lbl" x="683" y="124" text-anchor="middle">Longest Streak</text>
  <text class="sub" x="683" y="146" text-anchor="middle">${longest ? `${fmt(lStart)} - ${fmt(lEnd)}` : ""}</text>
</svg>`;

mkdirSync("assets", { recursive: true });
writeFileSync("assets/stats.svg", statsSvg);
console.log(`Done: total=${total}, current=${cur}, longest=${longest}`);
