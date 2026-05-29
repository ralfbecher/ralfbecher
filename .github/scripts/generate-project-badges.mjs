import { mkdir, writeFile } from "node:fs/promises";

const owner = "ralfbecher";
const outputDir = "badges";

const projects = [
  { repo: "orionbelt-analytics", version: true, license: "BSL 1.1" },
  { repo: "orionbelt-semantic-layer", version: true, license: "BSL 1.1" },
  { repo: "orionbelt-ontology-builder", version: true, license: "BSL 1.1" },
  { repo: "orionbelt-runner" },
  { repo: "orionbelt-chat" },
];

const colors = {
  label: "#555",
  blue: "#007ec6",
  green: "#44cc11",
};

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "ralfbecher-profile-badge-generator",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${path} failed with ${response.status}: ${body}`);
  }

  return response.json();
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function widthFor(value) {
  return Math.max(23, Math.ceil(String(value).length * 7 + 10));
}

function badge(label, message, color = colors.blue) {
  const safeLabel = escapeXml(label);
  const safeMessage = escapeXml(message);
  const labelWidth = widthFor(label);
  const messageWidth = widthFor(message);
  const width = labelWidth + messageWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${safeLabel}: ${safeMessage}">
  <title>${safeLabel}: ${safeMessage}</title>
  <g shape-rendering="crispEdges">
    <rect width="${labelWidth}" height="20" fill="${colors.label}"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${safeLabel}</text>
    <text x="${labelWidth + messageWidth / 2}" y="14">${safeMessage}</text>
  </g>
</svg>
`;
}

function parseVersion(tagName) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(tagName);
  if (!match) return null;

  return {
    name: tagName,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function latestSemver(tags) {
  const versions = tags
    .map((tag) => parseVersion(tag.name))
    .filter(Boolean)
    .sort((a, b) => (
      b.major - a.major ||
      b.minor - a.minor ||
      b.patch - a.patch
    ));

  return versions[0]?.name ?? tags[0]?.name ?? "n/a";
}

function relativeDate(value) {
  const date = new Date(value);
  const now = new Date();
  const dateDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.floor((nowDay - dateDay) / 86_400_000);

  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;

  return date.toLocaleString("en", { month: "short", timeZone: "UTC" }).toLowerCase();
}

async function writeBadge(name, label, message, color) {
  await writeFile(`${outputDir}/${name}.svg`, badge(label, message, color));
}

await mkdir(outputDir, { recursive: true });

for (const project of projects) {
  const repo = await github(`/repos/${owner}/${project.repo}`);
  const languages = await github(`/repos/${owner}/${project.repo}/languages`);
  const commit = await github(`/repos/${owner}/${project.repo}/commits/${encodeURIComponent(repo.default_branch)}`);

  await writeBadge(`${project.repo}-stars`, "stars", repo.stargazers_count, colors.blue);

  const languageEntries = Object.entries(languages).sort((a, b) => b[1] - a[1]);
  if (languageEntries.length > 0) {
    const [language, bytes] = languageEntries[0];
    const totalBytes = Object.values(languages).reduce((sum, value) => sum + value, 0);
    const percentage = `${((bytes / totalBytes) * 100).toFixed(1)}%`;
    await writeBadge(`${project.repo}-language`, language.toLowerCase(), percentage, colors.blue);
  }

  const committedAt = commit.commit?.committer?.date ?? repo.pushed_at;
  await writeBadge(`${project.repo}-last-commit`, "last commit", relativeDate(committedAt), colors.green);

  if (project.version) {
    const tags = await github(`/repos/${owner}/${project.repo}/tags?per_page=100`);
    await writeBadge(`${project.repo}-version`, "version", latestSemver(tags), colors.blue);
  }

  if (project.license) {
    await writeBadge(`${project.repo}-license`, "license", project.license, colors.blue);
  }
}
