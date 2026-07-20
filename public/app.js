const picker = document.querySelector("#picker");
const tutor = document.querySelector("#tutor");
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
let workflows = [];
let assignments = [];
let active = null;
let requestInFlight = false;
let lastGap = "";

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
    card.innerHTML = `<span class="card-icon">${workflow.icon}</span><span class="card-copy"><small>NOTION BUILD</small><strong>${workflow.title}</strong><em>${workflow.description}</em><span class="card-start">Start build <b>→</b></span></span>`;
    card.addEventListener("click", () => choose(workflow.id));
    return card;
  }));
}

function renderPracticeCards() {
  practiceCards.replaceChildren(...assignments.map((assignment) => {
    const card = document.createElement("button");
    card.type = "button"; card.className = "practice-card";
    card.innerHTML = `<span class="practice-level">${assignment.level}</span><strong>${assignment.title}</strong><p>${assignment.description}</p><span class="practice-start">Start challenge <b>→</b></span>`;
    card.addEventListener("click", () => choosePractice(assignment.id));
    return card;
  }));
}

function renderLesson(data) {
  active = data.workflow;
  picker.hidden = true; tutor.hidden = false;
  document.querySelector("#workflow-icon").textContent = active.icon;
  document.querySelector("#workflow-name").textContent = active.label;
  document.querySelector("#workflow-title").textContent = active.title;
  document.querySelector("#workflow-description").textContent = active.description;
  const badge = document.querySelector("#practice-badge");
  badge.hidden = !data.practice;
  badge.textContent = data.practice ? `${data.practice.level} practice · ${data.practice.title}` : "";
  document.querySelector("#scorecard").hidden = true;
  showMilestone(data.currentMilestone, data.milestone, data.narration);
}

async function choosePractice(id) {
  try {
    pickerStatus.textContent = "Loading your live challenge…";
    practiceCards.querySelectorAll("button").forEach((card) => card.disabled = true);
    renderLesson(await request(`/api/practice/${id}/start`, { method: "POST" }));
    status.textContent = "Complete each checkpoint in Notion. Your practice score appears at the end.";
  } catch (error) {
    pickerStatus.textContent = error.message;
    practiceCards.querySelectorAll("button").forEach((card) => card.disabled = false);
  }
}

function showMilestone(index, milestone, narration) {
  document.querySelector("#progress").textContent = `STEP ${index + 1} OF ${active.milestoneCount}`;
  document.querySelector("#instruction").innerHTML = `<p class="card-kicker">YOUR NEXT MOVE</p><h3>${milestone.title}</h3><p>${milestone.instruction}</p>`;
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
  button.disabled = true; button.innerHTML = "Checking workspace…"; status.textContent = "Reading the live Notion state…";
  try {
    const update = await request("/api/check", { method: "POST" });
    const note = document.createElement("article");
    note.className = `result ${update.passed ? "pass" : "gap"}`;
    note.innerHTML = `<strong>${update.passed ? "Verified in Notion" : "One thing to fix"}</strong><p>${update.narration}</p>`;
    feedback.replaceChildren(note);
    if (update.complete) { showCompleted(update); return; }
    if (update.passed) applyPassingUpdate(update, "manual");
    else status.textContent = "The workspace has a specific gap. Fix it in Notion, then check again.";
  } catch (error) { status.textContent = error.message; }
  requestInFlight = false;
  if (!button.disabled) button.innerHTML = "Check now <span>→</span>";
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

document.querySelector("#back").addEventListener("click", () => { tutor.hidden = true; picker.hidden = false; pickerStatus.textContent = "Use a clean shared Notion page before starting another workflow."; });

document.querySelector("#new-lesson").addEventListener("click", () => {
  tutor.hidden = true; picker.hidden = false; pickerStatus.textContent = ""; goalInput.focus();
});

sidebarToggle.addEventListener("click", () => {
  const collapsed = appFrame.classList.toggle("sidebar-collapsed");
  sidebarToggle.textContent = collapsed ? "›" : "‹";
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
});

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
    [workflows, assignments] = await Promise.all([request("/api/workflows").then((data) => data.workflows), request("/api/practice").then((data) => data.assignments)]);
    renderCards(); renderPracticeCards();
    const state = await request("/api/state");
    if (state.selected && !state.complete) renderLesson(state);
  } catch (error) { pickerStatus.textContent = error.message; }
}
boot();
