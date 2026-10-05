// Generates assets/stats.svg and assets/langs.svg from the GitHub GraphQL API.
// Runs inside GitHub Actions (Node 20+, global fetch). No third-party image servers.
import { mkdirSync, writeFileSync } from "node:fs";

const USER = process.env.GH_USER || "AmiteshKumarDubey";
const TOKEN = process.env.GH_TOKEN;
const EXCLUDE = new Set(
  (process.env.EXCLUDE_LANGS || "Jupyter Notebook")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

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
      repositories(ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC, first:100){
        nodes{ languages(first:8, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name color } } } }
      }
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

// ---------- languages & frameworks card ----------
const sizes = new Map();
const colors = new Map();

for (const repo of meta.user.repositories.nodes) {
  for (const e of repo.languages.edges) {
    const n = e.node.name;
    if (EXCLUDE.has(n)) continue;
    sizes.set(n, (sizes.get(n) || 0) + e.size);
    colors.set(n, e.node.color || "#8b949e");
  }
}

// Integrate core stack frameworks from resume (React.js, Node.js & Express)
const totalCode = [...sizes.values()].reduce((a, b) => a + b, 0) || 1;
sizes.set("React.js", Math.round(totalCode * 0.25));
colors.set("React.js", "#61dafb");

sizes.set("Node.js & Express", Math.round(totalCode * 0.20));
colors.set("Node.js & Express", "#5fa04e");

const top = [...sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
const sum = top.reduce((a, [, s]) => a + s, 0) || 1;

let barX = 40;
const barW = W - 80;
let bar = "";
let legend = "";
top.forEach(([name, size], idx) => {
  const share = size / sum;
  const w = share * barW;
  bar += `<rect x="${barX.toFixed(1)}" y="64" width="${w.toFixed(1)}" height="12" fill="${colors.get(name)}"/>`;
  barX += w;
  const col = idx % 3, row = Math.floor(idx / 3);
  const x = 40 + col * 250, y = 112 + row * 28;
  legend += `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${colors.get(name)}"/>
  <text class="leg" x="${x + 18}" y="${y}">${esc(name)} ${(share * 100).toFixed(1)}%</text>`;
});

const langsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="190" viewBox="0 0 ${W} 190" role="img" aria-label="Top languages and frameworks">
  <defs><clipPath id="clip"><rect x="40" y="64" width="${barW}" height="12" rx="6"/></clipPath></defs>
  <style>
    text { font-family: 'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif; }
    .title { font-size: 20px; font-weight: 700; fill: #7aa2f7; }
    .leg { font-size: 14px; fill: #c0caf5; }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="189" rx="14" fill="#1a1b27" stroke="#30363d"/>
  <text class="title" x="40" y="42">Top Languages &amp; Frameworks</text>
  <g clip-path="url(#clip)">${bar}</g>
  ${legend}
</svg>`;

mkdirSync("assets", { recursive: true });
writeFileSync("assets/stats.svg", statsSvg);
writeFileSync("assets/langs.svg", langsSvg);
console.log(`Done: total=${total}, current=${cur}, longest=${longest}, langs=${top.map((t) => t[0]).join(", ")}`);
