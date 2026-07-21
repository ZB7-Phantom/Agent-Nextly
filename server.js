import "dotenv/config";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
// Database schemas and rows moved to data-source endpoints in Notion API 2025-09-03.
const NOTION_VERSION = "2026-03-11";

const config = {
  notionToken: process.env.NOTION_TOKEN,
  parentPageId: process.env.NOTION_PARENT_PAGE_ID,
  geminiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
};

const workflows = {
  habits: {
    id: "habits", icon: "✓", label: "Habit tracker", title: "Build a habit tracker in Notion",
    description: "Turn everyday routines into a simple, repeatable check-in.", databaseTitle: "Habit Tracker",
    milestones: [
      { id: "database", title: "Create your habit database", instruction: "Create an inline database named “Habit Tracker” inside the shared Notion page. A database keeps each habit structured, so you can build a useful daily practice instead of a loose checklist." },
      { id: "checkbox", title: "Add a completion field", instruction: "Add a checkbox property to Habit Tracker. This creates a simple, explicit completion signal for every habit entry." },
      { id: "date", title: "Add a date field", instruction: "Add a date property to Habit Tracker. Dates turn a list of habits into a tracker you can use over time." },
      { id: "rows", title: "Add three habit entries", instruction: "Create at least three rows in Habit Tracker. Use real habits so the structure is ready for your first check-in." },
    ],
  },
  projects: {
    id: "projects", icon: "↗", label: "Project planner", title: "Plan a project in Notion",
    description: "Shape a small project into clear work, ownership, and deadlines.", databaseTitle: "Project Planner",
    milestones: [
      { id: "database", title: "Create your project database", instruction: "Create an inline database named “Project Planner” inside the shared Notion page. This gives project work a single, structured home." },
      { id: "select", title: "Add a status field", instruction: "Add a select property to Project Planner. Status lets you distinguish planned work from work that is in progress or complete." },
      { id: "date", title: "Add a deadline field", instruction: "Add a date property to Project Planner. A deadline helps each task connect to a real delivery moment." },
      { id: "rows", title: "Add three project tasks", instruction: "Create at least three rows in Project Planner. Each row can represent one concrete task for your project." },
    ],
  },
  reading: {
    id: "reading", icon: "▤", label: "Reading list", title: "Create a reading list in Notion",
    description: "Keep books and articles organized, discoverable, and ready to return to.", databaseTitle: "Reading List",
    milestones: [
      { id: "database", title: "Create your reading database", instruction: "Create an inline database named “Reading List” inside the shared Notion page. This gives every saved read a consistent place to live." },
      { id: "url", title: "Add a source link field", instruction: "Add a URL property to Reading List. A source link keeps the original book, article, or webpage one click away." },
      { id: "multi_select", title: "Add a topic field", instruction: "Add a multi-select property to Reading List. Topics make the collection easier to scan and revisit by subject." },
      { id: "rows", title: "Add three things to read", instruction: "Create at least three rows in Reading List. Add genuine titles you want to return to later." },
    ],
  },
};

const practiceAssignments = {
  "daily-check-in": { id: "daily-check-in", workflowId: "habits", level: "Beginner", title: "Build a daily check-in", description: "Create a habit tracker with a completion field, a date, and three real habits." },
  "launch-plan": { id: "launch-plan", workflowId: "projects", level: "Intermediate", title: "Plan a small launch", description: "Build a project board with status, deadlines, and three concrete tasks." },
  "research-library": { id: "research-library", workflowId: "reading", level: "Advanced", title: "Build a research library", description: "Organize sources with links, topics, and three items worth revisiting." },
};

let activeWorkflowId = null;
let currentMilestone = 0;
let activePractice = null;
let practiceStartedAt = null;
let manualChecks = 0;
let failedChecks = 0;
let cachedDatabase = null;

function assertConfigured() {
  const missing = [
    ["NOTION_TOKEN", config.notionToken],
    ["NOTION_PARENT_PAGE_ID", config.parentPageId],
    ["GEMINI_API_KEY", config.geminiKey],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Missing ${missing.join(", ")} in .env`);
}

async function notion(path, options = {}) {
  const response = await fetch(`https://api.notion.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.notionToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Notion ${response.status}: ${await response.text()}`);
  return response.json();
}

function plainText(richText = []) {
  return richText.map((part) => part.plain_text || part.text?.content || "").join("").trim();
}

async function findDatabase(workflow) {
  // After the first verified lookup, later milestones already know which data
  // source belongs to this single-session demo. This avoids re-listing blocks
  // and re-fetching the database before every check.
  if (cachedDatabase?.workflowId === workflow.id) return cachedDatabase.database;
  const children = await notion(`/v1/blocks/${config.parentPageId}/children?page_size=100`);
  const databaseBlocks = children.results.filter((block) => block.type === "child_database");
  if (!databaseBlocks.length) return null;

  // A child_database block alone is not enough evidence: it may be a linked or
  // inaccessible source. Scan all direct children and choose the first usable one.
  const issues = [];
  for (const databaseBlock of databaseBlocks) {
    try {
      const database = await notion(`/v1/databases/${databaseBlock.id}`);
      const dataSource = database.data_sources?.[0];
      const title = plainText(database.title);
      if (dataSource && title.toLowerCase() === workflow.databaseTitle.toLowerCase()) {
        const found = { id: databaseBlock.id, dataSourceId: dataSource.id, block: databaseBlock, title };
        cachedDatabase = { workflowId: workflow.id, database: found };
        return found;
      }
      if (dataSource) issues.push(`Found “${title || "Untitled"}”, not the expected “${workflow.databaseTitle}”.`);
      else issues.push(`Database ${databaseBlock.id}: no accessible data source was returned.`);
    } catch (error) {
      issues.push(`Database ${databaseBlock.id}: ${error.message}`);
    }
  }
  return { id: databaseBlocks[0].id, block: databaseBlocks[0], unavailable: true, reason: issues.join(" ") };
}

function quickNarration({ milestone, verification, passed }) {
  if (passed) return `Verified: ${verification.summary}`;
  const gap = verification.diff?.missing?.[0] || verification.summary;
  return `Not verified yet: ${gap}`;
}

function result(status, summary, missing = [], evidence = {}) {
  return { status, summary, diff: { missing, evidence } };
}

async function verifyDatabase(workflow) {
  const database = await findDatabase(workflow);
  if (!database) return result("fail", "No child database was found under the shared page.", [`Create an inline database named “${workflow.databaseTitle}” directly inside the shared page.`], { databaseFound: false });
  if (database.unavailable) return result("fail", `No accessible database named “${workflow.databaseTitle}” was found.`, [`Create an inline database named “${workflow.databaseTitle}” directly in the shared page and make sure the integration is connected to it.`], { databaseFound: true, databaseId: database.id, accessIssue: database.reason });
  return result("pass", `Found the accessible “${workflow.databaseTitle}” database.`, [], { databaseFound: true, databaseId: database.id, dataSourceId: database.dataSourceId });
}

async function verifyProperty(workflow, expectedType, label) {
  const database = await findDatabase(workflow);
  if (!database) return result("fail", "There is no database to inspect yet.", [`Create an inline database named “${workflow.databaseTitle}” before adding properties.`], { databaseFound: false });
  if (database.unavailable) return result("fail", `The “${workflow.databaseTitle}” database is not accessible to the integration.`, [`Create an inline database named “${workflow.databaseTitle}” and make sure the integration is connected to it.`], { databaseFound: true, databaseId: database.id, accessIssue: database.reason });
  const schema = await notion(`/v1/data_sources/${database.dataSourceId}`);
  const matching = Object.entries(schema.properties || {}).filter(([, property]) => property.type === expectedType).map(([name]) => name);
  if (!matching.length) return result("fail", `No ${expectedType}-type property was found.`, [`Add a ${label} property to the database.`], { databaseId: database.id, dataSourceId: database.dataSourceId, propertyTypes: Object.values(schema.properties || {}).map((p) => p.type) });
  return result("pass", `Found ${expectedType} property: ${matching.join(", ")}.`, [], { databaseId: database.id, dataSourceId: database.dataSourceId, matchingProperties: matching });
}

async function verifyRows(workflow) {
  const database = await findDatabase(workflow);
  if (!database) return result("fail", "There is no database to inspect yet.", [`Create the “${workflow.databaseTitle}” database and add at least three rows.`], { databaseFound: false });
  if (database.unavailable) return result("fail", `The “${workflow.databaseTitle}” database is not accessible to the integration.`, [`Create an inline database named “${workflow.databaseTitle}” and make sure the integration is connected to it.`], { databaseFound: true, databaseId: database.id, accessIssue: database.reason });
  const page = await notion(`/v1/data_sources/${database.dataSourceId}/query`, { method: "POST", body: JSON.stringify({ page_size: 3 }) });
  const count = page.results.length;
  if (count < 3) return result(count ? "partial" : "fail", `Found ${count} of the required 3 rows.`, [`Add ${3 - count} more database row${3 - count === 1 ? "" : "s"}.`], { databaseId: database.id, dataSourceId: database.dataSourceId, rowCountAtLeast: count });
  return result("pass", "Found at least three database rows.", [], { databaseId: database.id, dataSourceId: database.dataSourceId, rowCountAtLeast: 3 });
}

async function verify(workflow, milestone) {
  if (milestone.id === "database") return verifyDatabase(workflow);
  if (milestone.id === "rows") return verifyRows(workflow);
  return verifyProperty(workflow, milestone.id, milestone.id.replace("_", " "));
}

async function narrate({ phase, milestone, verification }) {
  const facts = verification
    ? `VERIFICATION STATUS: ${verification.status}\nVERIFIER SUMMARY: ${verification.summary}\nSTRUCTURED DIFF: ${JSON.stringify(verification.diff)}`
    : "No verification has been run yet.";
  const prompt = `You are Nextly, a precise in-product practice agent. The deterministic verifier—not you—decides correctness. Never claim a pass, failure, database state, or next step beyond the supplied facts. Write one compact, action-first note: maximum 36 words, one or two sentences, no greeting, no recap, no classroom language, no markdown. Say only what matters now and, when useful, one short reason.\n\nMILESTONE: ${milestone.title}\nFIXED INSTRUCTION: ${milestone.instruction}\nPHASE: ${phase}\n${facts}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": config.geminiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const text = body.candidates?.flatMap((candidate) => candidate.content?.parts || []).map((part) => part.text || "").join(" ").trim();
  const sentences = (text || "Follow the action steps shown here.").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return sentences.slice(0, 2).join(" ").trim().split(/\s+/).slice(0, 42).join(" ");
}

app.use(express.json());
app.use(express.static("public"));

function workflowSummary(workflow) {
  return { id: workflow.id, icon: workflow.icon, label: workflow.label, title: workflow.title, description: workflow.description, milestoneCount: workflow.milestones.length };
}

function practiceSummary() {
  const assignment = activePractice && practiceAssignments[activePractice];
  return assignment ? { id: assignment.id, level: assignment.level, title: assignment.title, description: assignment.description } : null;
}

function practiceScore() {
  if (!activePractice || !practiceStartedAt) return null;
  const elapsedMinutes = Math.max(1, Math.round((Date.now() - practiceStartedAt) / 60000));
  const completion = 50;
  const accuracy = Math.max(15, 35 - failedChecks * 5);
  const flow = elapsedMinutes <= 12 ? 15 : elapsedMinutes <= 25 ? 10 : 5;
  return { total: completion + accuracy + flow, completion, accuracy, flow, manualChecks, failedChecks, elapsedMinutes, note: "Flow measures checkpoint efficiency and elapsed practice time. Browser-level click tracking is not part of this demo." };
}

function guideFor(workflow, milestone) {
  const databaseName = `“${workflow.databaseTitle}”`;
  const propertyGuides = {
    checkbox: ["In the database header, click the + button to add a property.", "Name it Completed, then choose Checkbox from the property-type menu.", "You should see an empty square in every row."],
    date: ["In the database header, click + to add a property.", "Name it Date or Deadline, then choose Date from the property-type menu.", "A calendar control should appear in each row."],
    select: ["In the database header, click + to add a property.", "Name it Status, then choose Select from the property-type menu.", "Add choices such as Planned, In progress, and Done if Notion prompts you."],
    url: ["In the database header, click + to add a property.", "Name it Source, then choose URL from the property-type menu.", "Each row will now accept a clickable web link."],
    multi_select: ["In the database header, click + to add a property.", "Name it Topics, then choose Multi-select from the property-type menu.", "Add a topic such as AI, Design, or Product when Notion prompts you."],
  };
  if (milestone.id === "database") return ["Click an empty line in the shared Notion page.", "Type /database and choose Database – Inline.", `Rename the new database exactly ${databaseName}; Nextly uses this to find the right workspace object.`];
  if (milestone.id === "rows") return ["Open the database and click New, or use the blank row at the bottom.", "Add one meaningful item, then repeat until you have at least three rows.", "The item names can be anything relevant to your own habits, tasks, or reading list."];
  return propertyGuides[milestone.id] || ["Follow the instruction in Notion."];
}

function clientMilestone(workflow, milestone) {
  return { ...milestone, guide: guideFor(workflow, milestone) };
}

app.get("/api/workflows", (_req, res) => {
  res.json({ workflows: Object.values(workflows).map(workflowSummary) });
});

app.get("/api/practice", (_req, res) => {
  res.json({ assignments: Object.values(practiceAssignments) });
});

app.post("/api/workflows/:workflowId/start", async (req, res) => {
  try {
    assertConfigured();
    const workflow = workflows[req.params.workflowId];
    if (!workflow) return res.status(404).json({ error: "That demo workflow does not exist." });
    activeWorkflowId = workflow.id;
    currentMilestone = 0;
    cachedDatabase = null;
    activePractice = null; practiceStartedAt = null; manualChecks = 0; failedChecks = 0;
    const milestone = workflow.milestones[currentMilestone];
    const narration = await narrate({ phase: "introduce the first task", milestone });
    res.json({ workflow: workflowSummary(workflow), currentMilestone, milestone: clientMilestone(workflow, milestone), narration });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post("/api/practice/:assignmentId/start", async (req, res) => {
  try {
    assertConfigured();
    const assignment = practiceAssignments[req.params.assignmentId];
    if (!assignment) return res.status(404).json({ error: "That practice assignment does not exist." });
    const workflow = workflows[assignment.workflowId];
    activeWorkflowId = workflow.id; currentMilestone = 0; activePractice = assignment.id;
    cachedDatabase = null;
    practiceStartedAt = Date.now(); manualChecks = 0; failedChecks = 0;
    const milestone = workflow.milestones[currentMilestone];
    const narration = await narrate({ phase: `start ${assignment.level.toLowerCase()} practice`, milestone });
    res.json({ workflow: workflowSummary(workflow), practice: practiceSummary(), currentMilestone, milestone: clientMilestone(workflow, milestone), narration });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get("/api/state", async (_req, res) => {
  try {
    assertConfigured();
    if (!activeWorkflowId) return res.json({ selected: false });
    const workflow = workflows[activeWorkflowId];
    const milestone = workflow.milestones[currentMilestone];
    if (!milestone) return res.json({ selected: true, complete: true, workflow: workflowSummary(workflow), practice: practiceSummary(), practiceScore: practiceScore(), currentMilestone, narration: `You completed the ${workflow.label.toLowerCase()} path. The verifier confirmed every required state in the shared Notion workspace.` });
    const narration = await narrate({ phase: "introduce the next task", milestone });
    res.json({ selected: true, complete: false, workflow: workflowSummary(workflow), practice: practiceSummary(), currentMilestone, milestone: clientMilestone(workflow, milestone), narration });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post("/api/check", async (_req, res) => {
  try {
    assertConfigured();
    if (!activeWorkflowId) return res.status(400).json({ error: "Choose a demo workflow before checking work." });
    const workflow = workflows[activeWorkflowId];
    const milestone = workflow.milestones[currentMilestone];
    if (!milestone) return res.json({ complete: true, narration: "The demo is already complete." });
    if (activePractice) manualChecks += 1;
    const verification = await verify(workflow, milestone);
    const passed = verification.status === "pass";
    if (activePractice && !passed) failedChecks += 1;
    // The check path is intentionally LLM-free: it returns immediately after
    // deterministic API verification instead of waiting for a model response.
    const narration = quickNarration({ milestone, verification, passed });
    if (passed) currentMilestone += 1;
    const nextMilestone = workflow.milestones[currentMilestone];
    const complete = currentMilestone === workflow.milestones.length;
    res.json({ passed, verification, workflow: workflowSummary(workflow), practice: practiceSummary(), practiceScore: complete ? practiceScore() : null, currentMilestone, nextMilestone: nextMilestone ? clientMilestone(workflow, nextMilestone) : null, complete, narration });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post("/api/chat", async (req, res) => {
  try {
    assertConfigured();
    if (!activeWorkflowId) return res.status(400).json({ error: "Choose a workflow before asking Nextly a question." });
    const question = String(req.body?.question || "").trim().slice(0, 700);
    if (!question) return res.status(400).json({ error: "Ask Nextly a question first." });
    const workflow = workflows[activeWorkflowId];
    const milestone = workflow.milestones[currentMilestone];
    const prompt = `You are Nextly, a practical in-product agent. Answer the learner's Notion question with direct UI guidance: tell them where to click or what to type. Do not claim their work is correct, do not advance the workflow, and do not invent workspace state. Keep it under 55 words; no greeting or recap.\n\nWORKFLOW: ${workflow.title}\nCURRENT STEP: ${milestone?.title || "Completed"}\nGUIDE: ${(milestone ? guideFor(workflow, milestone) : []).join(" ")}\nLEARNER QUESTION: ${question}`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`, {
      method: "POST", headers: { "x-goog-api-key": config.geminiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
    });
    if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
    const body = await response.json();
    const answer = body.candidates?.flatMap((candidate) => candidate.content?.parts || []).map((part) => part.text || "").join("\n") || "I couldn’t form a response. Try asking where you are stuck in the current step.";
    res.json({ answer });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.listen(PORT, () => console.log(`Nextly demo: http://localhost:${PORT}`));
