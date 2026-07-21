const picker = document.querySelector("#picker");
const tutor = document.querySelector("#tutor");
const progressView = document.querySelector("#progress-view");
const worksView = document.querySelector("#works-view");
const cards = document.querySelector("#workflow-cards");
const practiceCards = document.querySelector("#practice-cards");
const pickerStatus = document.querySelector("#picker-status");
const button = document.querySelector("#check");
const status = document.querySelector("#status");
const feedback = document.querySelector("#feedback");
const guide = document.querySelector("#guide");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatMessages = document.querySelector("#chat-messages");
const goalForm = document.querySelector("#goal-form");
const goalInput = document.querySelector("#goal-input");
const appFrame = document.querySelector(".app-frame");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const mobileMenuButtons = document.querySelectorAll("[data-mobile-menu]");
const navButtons = { practice: document.querySelector("#nav-practice"), progress: document.querySelector("#nav-progress"), works: document.querySelector("#nav-works") };
let workflows = [];
let assignments = [];
let active = null;
let activePractice = null;
let requestInFlight = false;
let lastGap = "";

const fallbackAssignments = [
  { id: "daily-check-in", workflowId: "habits", level: "Beginner", title: "Build a daily check-in", description: "Create a habit tracker with a completion field, a date, and three real habits." },
  { id: "launch-plan", workflowId: "projects", level: "Intermediate", title: "Plan a small launch", description: "Build a project board with status, deadlines, and three concrete tasks." },
  { id: "research-library", workflowId: "reading", level: "Advanced", title: "Build a research library", description: "Organize sources with links, topics, and three items worth revisiting." },
];

function profile() { return JSON.parse(localStorage.getItem("nextly-demo-profile") || '{"works":[]}'); }
function saveProfile(data) { localStorage.setItem("nextly-demo-profile", JSON.stringify(data)); }
function recordWork(update) {
  const data = profile();
  const existing = data.works.findIndex((work) => work.id === active.id);
  const work = { id: active.id, title: active.title, label: active.label, practice: Boolean(activePractice), score: update.practiceScore?.total || null, completedAt: new Date().toISOString() };
  if (existing >= 0) data.works[existing] = work; else data.works.unshift(work);
  saveProfile(data);
}

function showLab(view) {
  picker.hidden = view !== "practice"; tutor.hidden = true; progressView.hidden = view !== "progress"; worksView.hidden = view !== "works";
  Object.entries(navButtons).forEach(([name, button]) => button.classList.toggle("active", name === view));
  if (view === "practice") { cards.querySelectorAll("button").forEach((card) => card.disabled = false); practiceCards.querySelectorAll("button").forEach((card) => card.disabled = false); }
  if (view === "progress") renderProgress();
  if (view === "works") renderWorks();
}

function icon(name, className = "ui-icon") {
  return `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function workflowIcon(workflow) {
  return icon(workflow.id === "habits" ? "check" : workflow.id === "projects" ? "list" : "book");
}

async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function renderCards() {
  cards.replaceChildren(...workflows.map((workflow) => {
    const card = document.createElement("button");
    card.type = "button"; card.className = "workflow-card";
    card.innerHTML = `<span class="card-icon">${workflowIcon(workflow)}</span><span class="card-copy"><small>NOTION BUILD</small><strong>${workflow.title}</strong><em>${workflow.description}</em><span class="card-start">Start build <b>${icon("arrow-right")}</b></span></span>`;
    card.addEventListener("click", () => choose(workflow.id));
    return card;
  }));
}

function renderPracticeCards() {
  practiceCards.replaceChildren(...assignments.map((assignment) => {
    const card = document.createElement("button");
    card.type = "button"; card.className = "practice-card";
    card.innerHTML = `<span class="practice-level">${assignment.level}</span><strong>${assignment.title}</strong><p>${assignment.description}</p><span class="practice-start">Start challenge <b>${icon("arrow-right")}</b></span>`;
    card.addEventListener("click", () => choosePractice(assignment.id));
    return card;
  }));
}

function renderLesson(data) {
  active = data.workflow;
  activePractice = data.practice || null;
  picker.hidden = true; progressView.hidden = true; worksView.hidden = true; tutor.hidden = false;
  Object.entries(navButtons).forEach(([name, button]) => button.classList.toggle("active", name === "practice"));
  document.querySelector("#workflow-icon").innerHTML = workflowIcon(active);
  document.querySelector("#workflow-name").textContent = active.label;
  document.querySelector("#workflow-title").textContent = active.title;
  document.querySelector("#workflow-description").textContent = active.description;
  const badge = document.querySelector("#practice-badge");
  badge.hidden = !data.practice;
  badge.textContent = data.practice ? `${data.practice.level} practice · ${data.practice.title}` : "";
  tutor.classList.toggle("practice-mode", Boolean(data.practice));
  const brief = document.querySelector("#challenge-brief");
  const guideCard = document.querySelector("#guide-card");
  brief.hidden = !data.practice;
  guideCard.hidden = Boolean(data.practice);
  if (data.practice) {
    brief.innerHTML = `<div class="challenge-top"><div><p class="card-kicker">PRACTICE BRIEF</p><h3>${data.practice.title}</h3></div><span>${data.practice.level}</span></div><p>${data.practice.description}</p><div class="challenge-rubric"><div><strong>Complete</strong><small>Finish every verified checkpoint.</small></div><div><strong>Accurate</strong><small>Fewer failed checks earn more points.</small></div><div><strong>Intentional</strong><small>Use Ask Nextly only when you need a hint.</small></div></div><p class="challenge-note">The click-by-click guide is hidden in Practice Lab. Build the outcome, then verify it.</p>`;
  }
  document.querySelector("#scorecard").hidden = true;
  showMilestone(data.currentMilestone, data.milestone, data.narration);
}

async function choosePractice(id) {
  try {
    pickerStatus.textContent = "Loading your live challenge…";
    practiceCards.querySelectorAll("button").forEach((card) => card.disabled = true);
    const assignment = assignments.find((item) => item.id === id);
    let data;
    try { data = await request(`/api/practice/${id}/start`, { method: "POST" }); }
    catch { data = await request(`/api/workflows/${assignment.workflowId}/start`, { method: "POST" }); data.practice = assignment; }
    renderLesson(data);
    status.textContent = "Complete each checkpoint in Notion. Your practice score appears at the end.";
  } catch (error) {
    pickerStatus.textContent = error.message;
    practiceCards.querySelectorAll("button").forEach((card) => card.disabled = false);
  }
}

function showMilestone(index, milestone, narration) {
  document.querySelector("#progress").textContent = `STEP ${index + 1} OF ${active.milestoneCount}`;
  document.querySelector("#instruction").innerHTML = `<p class="card-kicker">${tutor.classList.contains("practice-mode") ? "CHALLENGE CHECKPOINT" : "YOUR NEXT MOVE"}</p><h3>${milestone.title}</h3><p>${milestone.instruction}</p>`;
  document.querySelector("#narration").textContent = narration;
  const guideSteps = Array.isArray(milestone.guide) && milestone.guide.length
    ? milestone.guide
    : ["Open the shared Notion page.", milestone.instruction, "Use Check now once you have made the change."];
  guide.replaceChildren(...guideSteps.map((step, stepIndex) => {
    const item = document.createElement("li");
    item.innerHTML = `<span>${stepIndex + 1}</span><p>${step}</p>`;
    return item;
  }));
  feedback.replaceChildren();
  renderSteps(index);
  document.querySelector("#instruction").classList.remove("step-enter");
  requestAnimationFrame(() => document.querySelector("#instruction").classList.add("step-enter"));
  lastGap = "";
}

function renderSteps(current) {
  const list = document.querySelector("#steps");
  document.querySelector("#trail-count").textContent = `${current}/${active.milestoneCount} COMPLETE`;
  list.replaceChildren(...Array.from({ length: active.milestoneCount }, (_, index) => {
    const item = document.createElement("li");
    item.className = index < current ? "done" : index === current ? "active" : "";
    item.innerHTML = `<span>${index < current ? "✓" : index + 1}</span><div><strong>${index === 0 ? "Set the foundation" : index === active.milestoneCount - 1 ? "Make it useful" : "Add structure"}</strong><small>${index < current ? "Verified" : index === current ? "Live now" : "Queued"}</small></div>`;
    return item;
  }));
}

async function choose(id) {
  try {
    pickerStatus.textContent = "Setting up your guided build…";
    cards.querySelectorAll("button").forEach((card) => card.disabled = true);
    renderLesson(await request(`/api/workflows/${id}/start`, { method: "POST" }));
    status.textContent = "Make the change in Notion, then check it here.";
  } catch (error) {
    pickerStatus.textContent = error.message;
    cards.querySelectorAll("button").forEach((card) => card.disabled = false);
  }
}

function showCompleted(update) {
  recordWork(update);
  document.querySelector("#progress").textContent = `${active.milestoneCount} OF ${active.milestoneCount} VERIFIED`;
  document.querySelector("#instruction").innerHTML = `<p class="card-kicker">WORKFLOW COMPLETE</p><h3>You built it.</h3><p>Your workspace passed every live verification checkpoint.</p>`;
  document.querySelector("#narration").textContent = update.narration;
  renderSteps(active.milestoneCount); button.disabled = true; button.innerHTML = "Complete ✓";
  document.querySelector("#watch-label").innerHTML = "<span class=\"pulse complete\"></span> Workflow verified";
  status.textContent = "Great demo. Choose another workflow only on a clean Notion page.";
  if (update.practiceScore) renderScorecard(update.practiceScore);
}

function renderScorecard(score) {
  const card = document.querySelector("#scorecard");
  card.hidden = false;
  card.innerHTML = `<div><p class="card-kicker">PRACTICE RESULT</p><h3>${score.total}<small>/100</small></h3><p class="score-label">Verified build score</p></div><dl><div><dt>Completion</dt><dd>${score.completion}/50</dd></div><div><dt>Accuracy</dt><dd>${score.accuracy}/35</dd></div><div><dt>Flow</dt><dd>${score.flow}/15</dd></div></dl><p class="score-note">${score.note}</p>`;
}

function applyPassingUpdate(update, source) {
  if (update.complete) return showCompleted(update);
  showMilestone(update.currentMilestone, update.nextMilestone, update.narration);
  status.textContent = source === "watch" ? "Nextly spotted the completed step and moved you forward." : "That step is verified. Your next task is ready.";
}

async function checkNow() {
  if (requestInFlight) return;
  requestInFlight = true;
  let workflowComplete = false;
  button.disabled = true; button.innerHTML = "Checking workspace…"; status.textContent = "Reading the live Notion state…";
  try {
    const update = await request("/api/check", { method: "POST" });
    const note = document.createElement("article");
    note.className = `result ${update.passed ? "pass" : "gap"}`;
    note.innerHTML = `<strong>${update.passed ? "Verified in Notion" : "One thing to fix"}</strong><p>${update.narration}</p>`;
    feedback.replaceChildren(note);
    if (update.complete) { workflowComplete = true; showCompleted(update); return; }
    if (update.passed) applyPassingUpdate(update, "manual");
    else status.textContent = "The workspace has a specific gap. Fix it in Notion, then check again.";
  } catch (error) { status.textContent = error.message; }
  finally {
    requestInFlight = false;
    if (!workflowComplete) {
      button.disabled = false;
      button.innerHTML = `Verify step <span>${icon("arrow-right")}</span>`;
    }
  }
}

button.addEventListener("click", checkNow);

document.addEventListener("keydown", (event) => {
  if (!tutor.hidden && (event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault(); checkNow();
  }
  if (!tutor.hidden && (event.metaKey || event.ctrlKey) && event.key === "/") {
    event.preventDefault(); chatInput.focus();
  }
});

document.querySelector("#back").addEventListener("click", () => { showLab("practice"); pickerStatus.textContent = "Use a clean shared Notion page before starting another workflow."; });

document.querySelector("#new-lesson").addEventListener("click", () => {
  showLab("practice"); pickerStatus.textContent = ""; goalInput.focus();
});

navButtons.practice.addEventListener("click", () => showLab("practice"));
navButtons.progress.addEventListener("click", () => showLab("progress"));
navButtons.works.addEventListener("click", () => showLab("works"));
document.querySelectorAll("[data-lab-back]").forEach((button) => button.addEventListener("click", () => showLab("practice")));

function renderProgress() {
  const works = profile().works;
  const practiceScores = works.filter((work) => work.score).map((work) => work.score);
  const average = practiceScores.length ? Math.round(practiceScores.reduce((sum, score) => sum + score, 0) / practiceScores.length) : "—";
  document.querySelector("#progress-metrics").innerHTML = `<article><span>Verified builds</span><strong>${works.length}</strong><small>Real workspace outcomes</small></article><article><span>Practice score</span><strong>${average}</strong><small>${practiceScores.length ? "Average verified score" : "Complete a challenge to score"}</small></article><article><span>Current level</span><strong>${works.length >= 3 ? "Fluent" : works.length ? "Builder" : "Explorer"}</strong><small>Notion mastery path</small></article>`;
}

function renderWorks() {
  const works = profile().works;
  const grid = document.querySelector("#works-grid");
  const source = works.length ? works : workflows.map((workflow) => ({ ...workflow, empty: true }));
  grid.innerHTML = source.map((work) => `<article class="work-card ${work.empty ? "template" : ""}"><div class="work-card-icon">${workflowIcon(work)}</div><p>${work.empty ? "READY TO BUILD" : work.practice ? "PRACTICE COMPLETE" : "VERIFIED BUILD"}</p><h3>${work.title}</h3><span>${work.empty ? "Start a new verified build" : work.score ? `${work.score}/100 practice score` : "Workspace checkpoint complete"}</span><button type="button" data-workflow="${work.id}">${work.empty ? "Start build" : "Build again"} ${icon("arrow-right")}</button></article>`).join("");
  grid.querySelectorAll("[data-workflow]").forEach((button) => button.addEventListener("click", () => choose(button.dataset.workflow)));
}

sidebarToggle.addEventListener("click", () => {
  const collapsed = appFrame.classList.toggle("sidebar-collapsed");
  sidebarToggle.textContent = collapsed ? "›" : "‹";
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
});

mobileMenuButtons.forEach((menuButton) => menuButton.addEventListener("click", () => {
  const open = appFrame.classList.toggle("mobile-nav-open");
  mobileMenuButtons.forEach((button) => button.setAttribute("aria-expanded", String(open)));
}));

document.querySelectorAll(".app-sidebar button").forEach((sidebarButton) => sidebarButton.addEventListener("click", () => {
  if (window.matchMedia("(max-width: 720px)").matches) {
    appFrame.classList.remove("mobile-nav-open");
    mobileMenuButtons.forEach((button) => button.setAttribute("aria-expanded", "false"));
  }
}));

goalForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const goal = goalInput.value.trim();
  pickerStatus.textContent = goal
    ? "Custom goals are coming next. For this demo, choose one of the live Notion builds below."
    : "Tell Nextly what you want to build, or choose a live Notion suggestion below.";
});

function addChatMessage(kind, text) {
  const message = document.createElement("article");
  message.className = `chat-message ${kind}`;
  message.textContent = text;
  chatMessages.append(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = chatInput.value.trim();
  if (!question || !active) return;
  const submit = chatForm.querySelector("button");
  addChatMessage("user", question);
  chatInput.value = ""; chatInput.disabled = true; submit.disabled = true; submit.textContent = "Thinking…";
  try {
    const reply = await request("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
    addChatMessage("nextly", reply.answer);
  } catch (error) { addChatMessage("nextly", error.message); }
  chatInput.disabled = false; submit.disabled = false; submit.innerHTML = "Ask <span>↗</span>"; chatInput.focus();
});

async function boot() {
  try {
    workflows = (await request("/api/workflows")).workflows;
    try { assignments = (await request("/api/practice")).assignments; } catch { assignments = fallbackAssignments; }
    renderCards(); renderPracticeCards();
    const state = await request("/api/state");
    if (state.selected && !state.complete) renderLesson(state);
  } catch (error) { pickerStatus.textContent = error.message; }
}
boot();
