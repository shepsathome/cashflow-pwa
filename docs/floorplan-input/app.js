const STORAGE_KEY = "project-seattle.wall-survey.v2";
const LEGACY_STORAGE_KEY = "project-seattle.floorplan-input.v1";
const EXPORT_FILE_NAME = "project-seattle-wall-survey.json";
const PLAN_VERSION = "public-floorplans-v26";
const DIRECTIONS = ["North", "East", "South", "West", "North-east", "South-east", "South-west", "North-west"];
const BOUNDARY_TYPES = ["Unknown", "Exterior", "Internal", "Party/shared"];
const OPENING_TYPES = ["Internal Door", "External Door", "Double Door", "Window", "Continuous Glazing", "Archway"];
const FLOOR_DEFINITIONS = [
  { id: "ground", label: "Ground Floor" },
  { id: "first", label: "First Floor" },
  { id: "attic", label: "Attic" },
  { id: "cellar", label: "Cellar" }
];

const elements = {
  tabList: document.querySelector("#tab-list"),
  floorContent: document.querySelector("#floor-content"),
  walkContent: document.querySelector("#walk-content"),
  saveStatus: document.querySelector("#save-status"),
  floorSummary: document.querySelector("#floor-summary"),
  progress: document.querySelector("#survey-progress"),
  progressLabel: document.querySelector("#progress-label"),
  resumeButton: document.querySelector("#resume-button"),
  refreshPlanButton: document.querySelector("#refresh-plan-button"),
  exportButton: document.querySelector("#export-button"),
  importButton: document.querySelector("#import-button"),
  importFile: document.querySelector("#import-file"),
  walkModeButton: document.querySelector("#walk-mode-button"),
  editModeButton: document.querySelector("#edit-mode-button")
};

let activeFloorId = "ground";
let mode = "walk";
let surveyIndex = 0;
let saveTimer;
let transientMessageTimer;
let state;

await bootstrap();

async function bootstrap() {
  state = await loadState();
  try {
    await mergeCurrentPlan(false);
  } catch (error) {
    console.warn("Current rough plan was not available.", error);
  }
  bindEvents();
  render();
  setSaveStatus(savedAtMessage(state.updatedAt) || "Ready. Changes auto-save in this browser.");
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js");
  }
}

function bindEvents() {
  elements.exportButton.addEventListener("click", exportJson);
  elements.importButton.addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", handleImport);
  elements.refreshPlanButton.addEventListener("click", async () => {
    try {
      await mergeCurrentPlan(true);
      render();
      setTransientStatus("Rough-plan geometry refreshed; verified survey values were preserved.");
    } catch (error) {
      console.error(error);
      setTransientStatus("Could not load the current site plan. Start this tool with npm run serve.");
    }
  });
  elements.resumeButton.addEventListener("click", () => {
    mode = "walk";
    surveyIndex = firstUnverifiedIndex();
    render();
    elements.walkContent.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  elements.walkModeButton.addEventListener("click", () => {
    mode = "walk";
    render();
  });
  elements.editModeButton.addEventListener("click", () => {
    mode = "edit";
    render();
  });
}

async function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (saved) {
    try {
      return normalizeState(JSON.parse(saved));
    } catch (error) {
      console.warn("Saved survey could not be read.", error);
    }
  }

  try {
    const sourceUrl = location.pathname.startsWith("/measure/")
      ? "/measure-source.json"
      : "./measurement-source.json";
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (response.ok) return normalizeState(await response.json());
  } catch (error) {
    console.warn("Private measurement source was not available.", error);
  }
  return normalizeState({});
}

function normalizeState(source = {}) {
  const sourceFloors = Array.isArray(source.floors) ? source.floors : [];
  return {
    schemaVersion: "floorplan-survey.v2",
    schemaNotes: "Ordered exterior and room wall segments with measured length, thickness, adjacency, openings and verification status.",
    project: "Project-Seattle",
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: source.updatedAt || new Date().toISOString(),
    referencePlanVersion: source.referencePlanVersion || "",
    floors: FLOOR_DEFINITIONS.map((definition) => {
      const input = sourceFloors.find((floor) => floor?.id === definition.id) || {};
      return {
        id: definition.id,
        label: definition.label,
        northDirectionNote: stringValue(input.northDirectionNote),
        generalNotes: stringValue(input.generalNotes),
        exteriorWalls: Array.isArray(input.exteriorWalls) ? input.exteriorWalls.map(normalizeWall) : [],
        rooms: Array.isArray(input.rooms)
          ? input.rooms.map((room, index) => normalizeRoom(room, definition.label, index))
          : []
      };
    })
  };
}

function normalizeRoom(source = {}, level, index) {
  const dimensions = source.dimensions || {};
  const room = {
    id: source.id || createId("room"),
    referenceId: source.referenceId || "",
    name: stringValue(source.name || source.label) || `Room ${index + 1}`,
    level,
    dimensions: {
      lengthMeters: normalizeMeasurement(dimensions.lengthMeters ?? source.measured?.length),
      widthMeters: normalizeMeasurement(dimensions.widthMeters ?? source.measured?.width),
      irregularNotes: stringValue(dimensions.irregularNotes || source.shapeNote)
    },
    ceilingHeightMeters: normalizeMeasurement(source.ceilingHeightMeters ?? source.height),
    thresholdNotes: stringValue(source.thresholdNotes),
    notes: stringValue(source.notes),
    openings: Array.isArray(source.openings) ? source.openings.map(normalizeOpening) : [],
    walls: Array.isArray(source.walls) ? source.walls.map(normalizeWall) : []
  };
  if (!room.walls.length) room.walls = rectangularWalls(room);
  return room;
}

function normalizeWall(source = {}, index = 0) {
  return {
    id: source.id || createId("wall"),
    sequence: Number.isFinite(source.sequence) ? source.sequence : index + 1,
    label: stringValue(source.label) || `Wall ${index + 1}`,
    direction: DIRECTIONS.includes(source.direction) ? source.direction : "North",
    expectedLengthMeters: normalizeMeasurement(source.expectedLengthMeters),
    measuredLengthMeters: normalizeMeasurement(source.measuredLengthMeters),
    thicknessMeters: normalizeMeasurement(source.thicknessMeters),
    boundaryType: BOUNDARY_TYPES.includes(source.boundaryType) ? source.boundaryType : "Unknown",
    adjacentTo: stringValue(source.adjacentTo),
    startCorner: stringValue(source.startCorner),
    endCorner: stringValue(source.endCorner),
    notes: stringValue(source.notes),
    verified: Boolean(source.verified),
    verifiedAt: stringValue(source.verifiedAt)
  };
}

function normalizeOpening(source = {}) {
  return {
    id: source.id || createId("opening"),
    type: OPENING_TYPES.includes(source.type) ? source.type : titleCase(stringValue(source.type).replaceAll("-", " ")) || "Internal Door",
    wall: titleCase(stringValue(source.wall)) || "North",
    position: stringValue(source.position),
    offsetMeters: normalizeMeasurement(source.offsetMeters ?? source.offset),
    widthMeters: normalizeMeasurement(source.widthMeters ?? source.width),
    heightMeters: normalizeMeasurement(source.heightMeters),
    connectsTo: stringValue(source.connectsTo),
    verified: Boolean(source.verified)
  };
}

async function mergeCurrentPlan(force) {
  const response = await fetch("./floorplans.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Plan request failed: ${response.status}`);
  const plan = await response.json();
  if (!force && state.referencePlanVersion === PLAN_VERSION) return;

  for (const planFloor of plan.floors) {
    const floor = state.floors.find((item) => item.id === planFloor.id);
    if (!floor) continue;
    floor.exteriorWalls = mergeWalls(
      floor.exteriorWalls,
      wallsFromPoints(planFloor.buildingOutline || [], "Exterior perimeter", "Exterior")
    );

    for (const planRoom of planFloor.rooms) {
      let room = floor.rooms.find((item) =>
        item.referenceId === planRoom.id || canonicalName(item.name) === canonicalName(planRoom.label)
      );
      if (!room) {
        room = normalizeRoom({
          referenceId: planRoom.id,
          name: planRoom.label,
          measured: planRoom.measured,
          height: planRoom.height,
          shapeNote: planRoom.shapeNote,
          openings: planRoom.openings
        }, floor.label, floor.rooms.length);
        floor.rooms.push(room);
      }
      room.referenceId = planRoom.id;
      if (!room.dimensions.lengthMeters) room.dimensions.lengthMeters = normalizeMeasurement(planRoom.measured?.length);
      if (!room.dimensions.widthMeters) room.dimensions.widthMeters = normalizeMeasurement(planRoom.measured?.width);
      if (!room.ceilingHeightMeters) room.ceilingHeightMeters = normalizeMeasurement(planRoom.height);
      if (!room.dimensions.irregularNotes) room.dimensions.irregularNotes = stringValue(planRoom.shapeNote);
      if (!room.openings.length) room.openings = (planRoom.openings || []).map(normalizeOpening);

      const localPoints = planRoom.polygon || [
        [0, 0],
        [planRoom.width, 0],
        [planRoom.width, planRoom.depth],
        [0, planRoom.depth]
      ];
      room.walls = mergeWalls(room.walls, wallsFromPoints(localPoints, planRoom.label, "Unknown"));
    }
  }
  state.referencePlanVersion = PLAN_VERSION;
  touchState(true);
}

function wallsFromPoints(points, prefix, boundaryType) {
  if (points.length < 2) return [];
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const dx = next[0] - point[0];
    const dy = next[1] - point[1];
    const direction = directionFromVector(dx, dy);
    return normalizeWall({
      id: `${slug(prefix)}-wall-${index + 1}`,
      sequence: index + 1,
      label: `${prefix} · ${direction} segment ${index + 1}`,
      direction,
      expectedLengthMeters: Math.hypot(dx, dy).toFixed(3),
      boundaryType,
      startCorner: `Corner ${index + 1}`,
      endCorner: `Corner ${(index + 1) % points.length + 1}`
    }, index);
  });
}

function mergeWalls(existing, reference) {
  return reference.map((wall, index) => {
    const prior = existing.find((item) => item.id === wall.id) || existing[index];
    if (!prior) return wall;
    const normalized = normalizeWall(prior, index);
    return {
      ...wall,
      measuredLengthMeters: normalized.measuredLengthMeters,
      thicknessMeters: normalized.thicknessMeters,
      boundaryType: normalized.boundaryType === "Unknown" ? wall.boundaryType : normalized.boundaryType,
      adjacentTo: normalized.adjacentTo,
      notes: normalized.notes,
      verified: normalized.verified,
      verifiedAt: normalized.verifiedAt
    };
  });
}

function rectangularWalls(room) {
  const length = room.dimensions.lengthMeters;
  const width = room.dimensions.widthMeters;
  if (!length && !width) return [];
  return ["North", "East", "South", "West"].map((direction, index) =>
    normalizeWall({
      id: `${room.id}-wall-${index + 1}`,
      sequence: index + 1,
      label: `${direction} wall`,
      direction,
      expectedLengthMeters: direction === "North" || direction === "South" ? width : length
    }, index)
  );
}

function render() {
  renderTabs();
  renderProgress();
  elements.walkModeButton.setAttribute("aria-selected", String(mode === "walk"));
  elements.editModeButton.setAttribute("aria-selected", String(mode === "edit"));
  elements.walkContent.hidden = mode !== "walk";
  elements.floorContent.hidden = mode !== "edit";
  if (mode === "walk") renderWalk();
  else renderFloor();
}

function renderTabs() {
  elements.tabList.replaceChildren();
  state.floors.forEach((floor) => {
    const button = createElement("button", "tab-button", floor.label);
    button.type = "button";
    button.setAttribute("aria-selected", String(activeFloorId === floor.id));
    button.addEventListener("click", () => {
      activeFloorId = floor.id;
      surveyIndex = 0;
      render();
    });
    elements.tabList.append(button);
  });
}

function renderProgress() {
  const queue = buildSurveyQueue();
  const verified = queue.filter((item) => item.wall.verified).length;
  elements.progress.max = Math.max(queue.length, 1);
  elements.progress.value = verified;
  elements.progressLabel.textContent = `${verified} of ${queue.length} walls verified`;
  const floor = getFloor();
  const floorQueue = buildSurveyQueue(floor.id);
  elements.floorSummary.textContent = `${floor.rooms.length} spaces · ${floorQueue.filter((item) => item.wall.verified).length}/${floorQueue.length} walls verified`;
}

function renderWalk() {
  elements.walkContent.replaceChildren();
  const queue = buildSurveyQueue(activeFloorId);
  if (!queue.length) {
    const empty = createElement("section", "walk-card");
    empty.append(createElement("div", "walk-body", "No wall targets exist on this floor yet. Refresh the rough plan or add rooms in Review mode."));
    elements.walkContent.append(empty);
    return;
  }
  surveyIndex = Math.max(0, Math.min(surveyIndex, queue.length - 1));
  const item = queue[surveyIndex];
  const { wall } = item;

  const card = createElement("section", "walk-card");
  const header = createElement("header", "walk-header");
  const heading = document.createElement("div");
  heading.append(
    createElement("p", "eyebrow", item.room.name),
    createElement("h2", "", wall.label),
    createElement("p", "", `Walk clockwise: ${wall.startCorner || "start corner"} → ${wall.endCorner || "end corner"}`)
  );
  header.append(heading, createElement("span", "wall-number", `${surveyIndex + 1} / ${queue.length}`));

  const body = createElement("div", "walk-body");
  const callout = createElement("div", "survey-callout");
  callout.innerHTML = `
    <div><span>Rough-plan target</span><strong>${wall.expectedLengthMeters || "Unknown"} m</strong></div>
    <div><span>Direction</span><strong>${wall.direction}</strong></div>
    <div><span>Boundary</span><strong>${wall.boundaryType}</strong></div>
    <div><span>Adjoins</span><strong>${wall.adjacentTo || "Not recorded"}</strong></div>
  `;

  const form = createElement("div", "room-meta");
  form.append(
    numberField("Measured wall length (m)", wall.measuredLengthMeters, "Measure corner to corner", (value) => {
      wall.measuredLengthMeters = value;
      invalidateWall(wall);
    }),
    numberField("Wall thickness (m)", wall.thicknessMeters, "Measure at a doorway if possible", (value) => {
      wall.thicknessMeters = value;
      invalidateWall(wall);
    }),
    selectField("Direction", DIRECTIONS, wall.direction, (value) => {
      wall.direction = value;
      invalidateWall(wall);
    }),
    selectField("Boundary type", BOUNDARY_TYPES, wall.boundaryType, (value) => {
      wall.boundaryType = value;
      invalidateWall(wall);
    }),
    textField("What is on the other side?", wall.adjacentTo, "Outside or adjoining room", (value) => {
      wall.adjacentTo = value;
      invalidateWall(wall);
    }),
    textareaField("Wall notes", wall.notes, "Alcoves, chimney breasts, curves, changes in thickness, uncertainty.", (value) => {
      wall.notes = value;
      invalidateWall(wall);
    })
  );

  const relevantOpenings = item.room.openings.filter(
    (opening) => opening.wall.toLowerCase() === wall.direction.toLowerCase()
  );
  const reminder = createElement("div", "opening-reminder");
  reminder.innerHTML = relevantOpenings.length
    ? `<strong>Openings expected on this wall</strong><ul>${relevantOpenings.map((opening) =>
        `<li>${opening.type}: ${opening.widthMeters || "?"} m wide; offset ${opening.offsetMeters || opening.position || "not recorded"}; ${opening.connectsTo || ""}</li>`
      ).join("")}</ul>`
    : "<strong>No opening is currently recorded on this segment.</strong> Add or correct openings in Review mode if needed.";

  const verified = createElement("label", "verify-toggle");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = wall.verified;
  checkbox.addEventListener("change", () => {
    wall.verified = checkbox.checked;
    wall.verifiedAt = checkbox.checked ? new Date().toISOString() : "";
    touchState();
    renderProgress();
  });
  verified.append(checkbox, document.createTextNode("I stood at this wall and verified these details"));

  const actions = createElement("div", "walk-actions");
  const previous = button("Previous", "secondary-button", () => {
    surveyIndex = Math.max(0, surveyIndex - 1);
    renderWalk();
  });
  previous.disabled = surveyIndex === 0;
  const review = button("Review room", "secondary-button", () => {
    mode = "edit";
    render();
    document.querySelector(`[data-room-id="${item.room?.id || ""}"]`)?.scrollIntoView({ behavior: "smooth" });
  });
  const next = button(wall.verified ? "Save & next" : "Skip for now", "primary-button", () => {
    touchState(true);
    surveyIndex = Math.min(queue.length - 1, surveyIndex + 1);
    render();
  });
  actions.append(previous, review, document.createElement("span"), next);
  body.append(callout, form, reminder, verified, actions);
  card.append(header, body);
  elements.walkContent.append(card);
}

function renderFloor() {
  elements.floorContent.replaceChildren();
  const floor = getFloor();
  const panel = createElement("section", "floor-panel");
  const header = createElement("div", "panel-header");
  const heading = document.createElement("div");
  heading.append(
    createElement("h2", "", floor.label),
    createElement("p", "", "Review rooms, wall segments and openings. Use Guided walk for fast on-site capture.")
  );
  header.append(heading, button("Add room", "secondary-button", () => {
    floor.rooms.push(normalizeRoom({ name: "New room" }, floor.label, floor.rooms.length));
    touchState();
    renderFloor();
  }));

  const rooms = createElement("div", "room-list");
  floor.rooms.forEach((room, roomIndex) => rooms.append(renderRoom(room, roomIndex)));
  panel.append(header, rooms);
  elements.floorContent.append(panel);
}

function renderRoom(room, roomIndex) {
  const card = createElement("article", "room-card");
  card.dataset.roomId = room.id;
  const header = createElement("div", "room-header");
  const heading = document.createElement("div");
  heading.append(createElement("h3", "", room.name), createElement("p", "", `${room.walls.filter((wall) => wall.verified).length}/${room.walls.length} walls verified`));
  header.append(heading, button("Remove room", "danger-button", () => {
    getFloor().rooms.splice(roomIndex, 1);
    touchState();
    render();
  }));

  const fields = createElement("div", "room-meta");
  fields.append(
    textField("Room name", room.name, "", (value) => { room.name = value; touchState(); }),
    numberField("Reference length (m)", room.dimensions.lengthMeters, "", (value) => { room.dimensions.lengthMeters = value; touchState(); }),
    numberField("Reference width (m)", room.dimensions.widthMeters, "", (value) => { room.dimensions.widthMeters = value; touchState(); }),
    numberField("Ceiling height (m)", room.ceilingHeightMeters, "", (value) => { room.ceilingHeightMeters = value; touchState(); }),
    textareaField("Shape notes", room.dimensions.irregularNotes, "", (value) => { room.dimensions.irregularNotes = value; touchState(); })
  );

  const wallHeader = createElement("div", "opening-header");
  wallHeader.append(createElement("h3", "", "Ordered wall segments"), button("Add wall segment", "small-button", () => {
    room.walls.push(normalizeWall({ label: `Wall ${room.walls.length + 1}` }, room.walls.length));
    touchState();
    renderFloor();
  }));

  const openingHeader = createElement("div", "opening-header");
  openingHeader.append(createElement("h3", "", "Doors & windows"), button("Add opening", "small-button", () => {
    room.openings.push(normalizeOpening());
    touchState();
    renderFloor();
  }));
  const openingList = createElement("div", "opening-list");
  room.openings.forEach((opening, index) => openingList.append(renderOpening(room, opening, index)));
  if (!room.openings.length) openingList.append(createElement("p", "subtle", "No openings recorded."));

  card.append(header, fields, wallHeader, renderWallList(room.walls), openingHeader, openingList);
  return card;
}

function renderWallList(walls) {
  const list = createElement("div", "wall-list");
  walls.forEach((wall) => {
    const card = createElement("article", `wall-card${wall.verified ? " is-verified" : ""}`);
    const summary = createElement("div", "wall-summary");
    const text = document.createElement("div");
    text.append(
      createElement("strong", "", `${wall.sequence}. ${wall.label}`),
      createElement("p", "", `${wall.direction} · rough ${wall.expectedLengthMeters || "?"} m · measured ${wall.measuredLengthMeters || "pending"} m`)
    );
    summary.append(text, createElement("span", "verified-badge", wall.verified ? "Verified" : "Pending"));
    card.append(summary);
    list.append(card);
  });
  return list;
}

function renderOpening(room, opening, openingIndex) {
  const card = createElement("article", "opening-card");
  const header = createElement("div", "opening-header");
  header.append(createElement("h3", "", `${opening.type} ${openingIndex + 1}`), button("Remove", "ghost-button", () => {
    room.openings.splice(openingIndex, 1);
    touchState();
    renderFloor();
  }));
  const fields = createElement("div", "opening-grid");
  fields.append(
    selectField("Type", OPENING_TYPES, opening.type, (value) => { opening.type = value; touchState(); }),
    selectField("Wall direction", DIRECTIONS, opening.wall, (value) => { opening.wall = value; touchState(); }),
    numberField("Offset from starting corner (m)", opening.offsetMeters, "", (value) => { opening.offsetMeters = value; touchState(); }),
    numberField("Width (m)", opening.widthMeters, "", (value) => { opening.widthMeters = value; touchState(); }),
    numberField("Height (m)", opening.heightMeters, "", (value) => { opening.heightMeters = value; touchState(); }),
    textField("Connects to", opening.connectsTo, "", (value) => { opening.connectsTo = value; touchState(); })
  );
  card.append(header, fields);
  return card;
}

function buildSurveyQueue(floorId) {
  const floors = floorId ? state.floors.filter((floor) => floor.id === floorId) : state.floors;
  return floors.flatMap((floor) =>
    floor.rooms.flatMap((room) => room.walls.map((wall) => ({ floor, room, scope: "room", wall })))
  );
}

function firstUnverifiedIndex() {
  const queue = buildSurveyQueue(activeFloorId);
  const index = queue.findIndex((item) => !item.wall.verified);
  return index < 0 ? 0 : index;
}

function getFloor() {
  return state.floors.find((floor) => floor.id === activeFloorId);
}

function invalidateWall(wall) {
  wall.verified = false;
  wall.verifiedAt = "";
  touchState();
}

function touchState(immediate = false) {
  state.updatedAt = new Date().toISOString();
  clearTimeout(saveTimer);
  if (immediate) saveState();
  else saveTimer = setTimeout(saveState, 250);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  setSaveStatus(savedAtMessage(state.updatedAt));
}

function exportJson() {
  saveState();
  const payload = {
    ...state,
    exportedAt: new Date().toISOString(),
    exportNotes: "Keep private. Contains detailed property geometry and opening locations."
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = EXPORT_FILE_NAME;
  link.click();
  URL.revokeObjectURL(url);
  setTransientStatus("Survey export downloaded.");
}

async function handleImport(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    state = normalizeState(JSON.parse(await file.text()));
    await mergeCurrentPlan(false);
    saveState();
    render();
    setTransientStatus(`Imported ${file.name}.`);
  } catch (error) {
    console.error(error);
    setTransientStatus("Import failed. Choose a valid Project Seattle survey JSON file.");
  } finally {
    event.target.value = "";
  }
}

function numberField(label, value, placeholder, onInput) {
  return inputField({ label, value, placeholder, type: "number", step: "0.001", inputMode: "decimal", onInput });
}

function textField(label, value, placeholder, onInput) {
  return inputField({ label, value, placeholder, type: "text", onInput });
}

function inputField({ label, value, placeholder, type, step = "", inputMode = "", onInput }) {
  const field = createElement("div", "field");
  const id = createId("field");
  const fieldLabel = document.createElement("label");
  fieldLabel.htmlFor = id;
  fieldLabel.textContent = label;
  const input = document.createElement("input");
  input.id = id;
  input.type = type;
  input.value = value || "";
  input.placeholder = placeholder || "";
  if (step) input.step = step;
  if (inputMode) input.inputMode = inputMode;
  input.addEventListener("input", () => onInput(input.value));
  field.append(fieldLabel, input);
  return field;
}

function selectField(label, options, value, onInput) {
  const field = createElement("div", "field");
  const id = createId("field");
  const fieldLabel = document.createElement("label");
  fieldLabel.htmlFor = id;
  fieldLabel.textContent = label;
  const select = document.createElement("select");
  select.id = id;
  options.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    option.selected = optionValue.toLowerCase() === String(value).toLowerCase();
    select.append(option);
  });
  select.addEventListener("change", () => onInput(select.value));
  field.append(fieldLabel, select);
  return field;
}

function textareaField(label, value, hint, onInput) {
  const field = createElement("div", "field");
  const id = createId("field");
  const fieldLabel = document.createElement("label");
  fieldLabel.htmlFor = id;
  fieldLabel.textContent = label;
  const textarea = document.createElement("textarea");
  textarea.id = id;
  textarea.value = value || "";
  textarea.addEventListener("input", () => onInput(textarea.value));
  field.append(fieldLabel, textarea);
  if (hint) field.append(createElement("div", "hint", hint));
  return field;
}

function button(label, className, onClick) {
  const element = createElement("button", className, label);
  element.type = "button";
  element.addEventListener("click", onClick);
  return element;
}

function createElement(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function normalizeMeasurement(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = trimmed.replace(",", ".").match(/\d+(?:\.\d+)?/);
  if (!match) return "";
  let number = Number(match[0]);
  if (!trimmed.includes(".") && !trimmed.includes(",") && number >= 10) {
    while (number >= 10) number /= 10;
  }
  return Number(number.toFixed(3)).toString();
}

function directionFromVector(dx, dy) {
  const threshold = 0.001;
  if (Math.abs(dx) < threshold) return dy > 0 ? "South" : "North";
  if (Math.abs(dy) < threshold) return dx > 0 ? "East" : "West";
  if (dx > 0 && dy > 0) return "South-east";
  if (dx > 0 && dy < 0) return "North-east";
  if (dx < 0 && dy > 0) return "South-west";
  return "North-west";
}

function normalizedName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function canonicalName(value) {
  const normalized = normalizedName(value);
  const aliases = {
    backentryroom: "backentry",
    blackandwhitebedroom: "blackwhitebedroom",
    laundryroom: "laundry",
    toilet: "wc"
  };
  return aliases[normalized] || normalized;
}

function slug(value) {
  return normalizedName(value) || "wall";
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function setSaveStatus(message) {
  elements.saveStatus.textContent = message;
}

function savedAtMessage(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `Saved locally: ${date.toLocaleString()}`;
}

function setTransientStatus(message) {
  clearTimeout(transientMessageTimer);
  setSaveStatus(message);
  transientMessageTimer = setTimeout(() => setSaveStatus(savedAtMessage(state.updatedAt)), 3000);
}
