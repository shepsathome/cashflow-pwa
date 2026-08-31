const STORAGE_KEY = "project-seattle.floorplan-input.v1";
const EXPORT_FILE_NAME = "floorplan-input.json";
const FLOOR_DEFINITIONS = [
  {
    id: "ground",
    label: "Ground Floor",
    defaultRooms: [
      "Gym",
      "Verriere",
      "Lounge",
      "Entrance Lounge",
      "Dining Room",
      "Kitchen",
      "Toilet",
      "Laundry Room",
      "Back Hall",
      "Pantry",
      "Oil Heating System",
      "Stairs to 1st Floor (near Lounge / Entrance?)",
      "Stairs to 1st Floor (near Back Hall?)",
      "Stairs to Cellar"
    ]
  },
  {
    id: "first",
    label: "First Floor",
    defaultRooms: [
      "Bedroom 1",
      "Bedroom 2",
      "Bedroom 3",
      "Hallway",
      "Foyer",
      "Bathroom",
      "Office",
      "En Suite",
      "Stairs to Attic",
      "Stairs to Ground Floor"
    ]
  },
  {
    id: "attic",
    label: "Attic",
    defaultRooms: [
      "Attic",
      "Stairs (up from First Floor)"
    ]
  },
  {
    id: "cellar",
    label: "Cellar",
    defaultRooms: [
      "Cellar 1",
      "Cellar 2",
      "Barn",
      "Stairs to Cellar"
    ]
  }
];
const OPENING_TYPES = ["Internal Door", "External Door", "Window"];
const WALL_OPTIONS = ["North", "South", "East", "West"];

const tabList = document.querySelector("#tab-list");
const floorContent = document.querySelector("#floor-content");
const saveStatus = document.querySelector("#save-status");
const floorSummary = document.querySelector("#floor-summary");
const exportButton = document.querySelector("#export-button");
const importButton = document.querySelector("#import-button");
const importFile = document.querySelector("#import-file");

let activeFloorId = FLOOR_DEFINITIONS[0].id;
let saveTimer = null;
let transientMessageTimer = null;
let state = loadState();

renderTabs();
renderFloor();
setSaveStatus(getSavedAtMessage(state.updatedAt) || "Ready. Changes auto-save in this browser.");

exportButton.addEventListener("click", exportJson);
importButton.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", handleImport);

function createId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createOpening(source = {}) {
  return {
    id: source.id || createId("opening"),
    type: OPENING_TYPES.includes(source.type) ? source.type : "Internal Door",
    wall: WALL_OPTIONS.includes(source.wall) ? source.wall : "North",
    position: typeof source.position === "string" ? source.position : "",
    widthMeters: normalizeNumberString(source.widthMeters),
    connectsTo: typeof source.connectsTo === "string" ? source.connectsTo : ""
  };
}

function createRoom(name, level, source = {}) {
  const dimensions = source.dimensions || {};
  return {
    id: source.id || createId("room"),
    name: typeof source.name === "string" && source.name.trim() ? source.name : name,
    level,
    dimensions: {
      lengthMeters: normalizeNumberString(dimensions.lengthMeters),
      widthMeters: normalizeNumberString(dimensions.widthMeters),
      irregularNotes: typeof dimensions.irregularNotes === "string" ? dimensions.irregularNotes : ""
    },
    ceilingHeightMeters: normalizeNumberString(source.ceilingHeightMeters),
    thresholdNotes: typeof source.thresholdNotes === "string" ? source.thresholdNotes : "",
    openings: Array.isArray(source.openings) ? source.openings.map((opening) => createOpening(opening)) : [],
    notes: typeof source.notes === "string" ? source.notes : ""
  };
}

function createInitialState() {
  return {
    schemaVersion: "floorplan-input.v1",
    schemaNotes:
      "floors[].rooms[] captures editable room entries with optional rectangular dimensions, irregular-shape notes, ceiling height, threshold notes, openings, and general notes.",
    project: "Project-Seattle",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    floors: FLOOR_DEFINITIONS.map((definition) => ({
      id: definition.id,
      label: definition.label,
      northDirectionNote: "",
      generalNotes: "",
      rooms: definition.defaultRooms.map((roomName) => createRoom(roomName, definition.label))
    }))
  };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createInitialState();
    }
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch (error) {
    console.warn("Could not load saved floorplan input state.", error);
    return createInitialState();
  }
}

function normalizeState(source = {}) {
  const base = createInitialState();
  const sourceFloors = Array.isArray(source.floors) ? source.floors : [];
  const floors = FLOOR_DEFINITIONS.map((definition) => {
    const importedFloor = sourceFloors.find((floor) => floor && floor.id === definition.id);
    if (!importedFloor) {
      return base.floors.find((floor) => floor.id === definition.id);
    }
    return {
      id: definition.id,
      label: definition.label,
      northDirectionNote:
        typeof importedFloor.northDirectionNote === "string" ? importedFloor.northDirectionNote : "",
      generalNotes: typeof importedFloor.generalNotes === "string" ? importedFloor.generalNotes : "",
      rooms: Array.isArray(importedFloor.rooms)
        ? importedFloor.rooms.map((room, index) =>
            createRoom(
              definition.defaultRooms[index] || `Room ${index + 1}`,
              definition.label,
              room
            )
          )
        : definition.defaultRooms.map((roomName) => createRoom(roomName, definition.label))
    };
  });

  return {
    schemaVersion: typeof source.schemaVersion === "string" ? source.schemaVersion : base.schemaVersion,
    schemaNotes: typeof source.schemaNotes === "string" ? source.schemaNotes : base.schemaNotes,
    project: typeof source.project === "string" ? source.project : base.project,
    createdAt: typeof source.createdAt === "string" ? source.createdAt : base.createdAt,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : base.updatedAt,
    floors
  };
}

function normalizeNumberString(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === "string" ? value : "";
}

function getFloor(floorId = activeFloorId) {
  return state.floors.find((floor) => floor.id === floorId);
}

function renderTabs() {
  tabList.textContent = "";
  FLOOR_DEFINITIONS.forEach((definition) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab-button";
    button.id = `tab-${definition.id}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `panel-${definition.id}`);
    button.setAttribute("aria-selected", String(activeFloorId === definition.id));
    button.textContent = definition.label;
    button.addEventListener("click", () => {
      activeFloorId = definition.id;
      renderTabs();
      renderFloor();
    });
    tabList.append(button);
  });
}

function renderFloor() {
  const floor = getFloor();
  if (!floor) {
    return;
  }

  floorContent.textContent = "";
  floorSummary.textContent = `${floor.rooms.length} room entries on ${floor.label}`;

  const panel = createElement("section", "floor-panel");
  panel.id = `panel-${floor.id}`;
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-labelledby", `tab-${floor.id}`);

  const panelHeader = createElement("div", "panel-header");
  const panelHeaderText = document.createElement("div");
  panelHeaderText.append(
    createElement("h2", "", floor.label),
    createElement(
      "p",
      "",
      "Use this floor tab to capture north direction, general notes, and room-by-room details."
    )
  );
  const toolbar = createElement("div", "toolbar");
  const addRoomButton = createElement("button", "secondary-button", "Add room");
  addRoomButton.type = "button";
  addRoomButton.addEventListener("click", () => {
    floor.rooms.push(createRoom("New room", floor.label));
    touchState();
    renderFloor();
  });
  toolbar.append(addRoomButton);
  panelHeader.append(panelHeaderText, toolbar);

  const globalGrid = createElement("div", "grid");
  globalGrid.append(
    createTextareaField({
      label: "North direction note",
      hint: 'Example: "Top of sketch is roughly north."',
      value: floor.northDirectionNote,
      onInput: (value) => {
        floor.northDirectionNote = value;
        touchState();
      }
    }),
    createTextareaField({
      label: "Floor-level general notes",
      hint: "Anything that applies to the whole floor.",
      value: floor.generalNotes,
      onInput: (value) => {
        floor.generalNotes = value;
        touchState();
      }
    })
  );

  const roomList = createElement("div", "room-list");
  floor.rooms.forEach((room, roomIndex) => {
    roomList.append(renderRoomCard(floor, room, roomIndex));
  });

  panel.append(panelHeader, globalGrid, roomList);
  floorContent.append(panel);
}

function renderRoomCard(floor, room, roomIndex) {
  const card = createElement("article", "room-card");

  const header = createElement("div", "room-header");
  const headerText = document.createElement("div");
  headerText.append(
    createElement("h3", "", room.name || `Room ${roomIndex + 1}`),
    createElement("p", "", "Room name is editable. Level is set automatically from this tab.")
  );
  const actions = createElement("div", "toolbar");
  const levelPill = createElement("span", "pill", room.level);
  const removeButton = createElement("button", "danger-button", "Remove room");
  removeButton.type = "button";
  removeButton.addEventListener("click", () => {
    floor.rooms.splice(roomIndex, 1);
    touchState();
    renderFloor();
  });
  actions.append(levelPill, removeButton);
  header.append(headerText, actions);

  const metaGrid = createElement("div", "room-meta");
  metaGrid.append(
    createInputField({
      label: "Room name",
      type: "text",
      value: room.name,
      onInput: (value, input) => {
        room.name = value;
        const heading = input.closest(".room-card")?.querySelector("h3");
        if (heading) {
          heading.textContent = value || `Room ${roomIndex + 1}`;
        }
        touchState();
      }
    }),
    createInputField({
      label: "Rectangular length (m)",
      type: "number",
      inputMode: "decimal",
      step: "0.01",
      placeholder: "e.g. 4.25",
      value: room.dimensions.lengthMeters,
      onInput: (value) => {
        room.dimensions.lengthMeters = value;
        touchState();
      }
    }),
    createInputField({
      label: "Rectangular width (m)",
      type: "number",
      inputMode: "decimal",
      step: "0.01",
      placeholder: "e.g. 3.8",
      value: room.dimensions.widthMeters,
      onInput: (value) => {
        room.dimensions.widthMeters = value;
        touchState();
      }
    }),
    createInputField({
      label: "Ceiling height (m, optional)",
      type: "number",
      inputMode: "decimal",
      step: "0.01",
      placeholder: "Optional",
      value: room.ceilingHeightMeters,
      onInput: (value) => {
        room.ceilingHeightMeters = value;
        touchState();
      }
    }),
    createTextareaField({
      label: "Non-rectangular shape / measurement notes",
      hint: "Use for alcoves, angled walls, uncertain measurements, or other shape notes.",
      value: room.dimensions.irregularNotes,
      onInput: (value) => {
        room.dimensions.irregularNotes = value;
        touchState();
      }
    }),
    createTextareaField({
      label: "Step / threshold notes",
      hint: 'Example: "Sunken by one step."',
      value: room.thresholdNotes,
      onInput: (value) => {
        room.thresholdNotes = value;
        touchState();
      }
    }),
    createTextareaField({
      label: "General room notes",
      hint: "Anything else worth remembering about this room.",
      value: room.notes,
      onInput: (value) => {
        room.notes = value;
        touchState();
      }
    })
  );

  const openingSection = createElement("section", "");
  const openingHeader = createElement("div", "opening-header");
  const openingHeaderText = document.createElement("div");
  openingHeaderText.append(
    createElement("h3", "", "Openings"),
    createElement("p", "", "Approximate wall and position are fine if you are unsure.")
  );
  const addOpeningButton = createElement("button", "small-button", "Add opening");
  addOpeningButton.type = "button";
  addOpeningButton.addEventListener("click", () => {
    room.openings.push(createOpening());
    touchState();
    renderFloor();
  });
  openingHeader.append(openingHeaderText, addOpeningButton);

  const openingList = createElement("div", "opening-list");
  if (room.openings.length === 0) {
    openingList.append(createElement("p", "subtle", "No openings added yet."));
  } else {
    room.openings.forEach((opening, openingIndex) => {
      openingList.append(renderOpeningCard(room, opening, openingIndex));
    });
  }

  openingSection.append(openingHeader, openingList);
  card.append(header, metaGrid, openingSection);
  return card;
}

function renderOpeningCard(room, opening, openingIndex) {
  const card = createElement("article", "opening-card");

  const header = createElement("div", "opening-header");
  const titleText = `${opening.type || "Opening"} ${openingIndex + 1}`;
  const headerText = document.createElement("div");
  headerText.append(
    createElement("h3", "", titleText),
    createElement("p", "", "Door/window details can stay approximate.")
  );
  const removeButton = createElement("button", "ghost-button", "Remove opening");
  removeButton.type = "button";
  removeButton.addEventListener("click", () => {
    room.openings.splice(openingIndex, 1);
    touchState();
    renderFloor();
  });
  header.append(headerText, removeButton);

  const grid = createElement("div", "opening-grid");
  grid.append(
    createSelectField({
      label: "Type",
      options: OPENING_TYPES,
      value: opening.type,
      onInput: (value, select) => {
        opening.type = value;
        const heading = select.closest(".opening-card")?.querySelector("h3");
        if (heading) {
          heading.textContent = `${value} ${openingIndex + 1}`;
        }
        touchState();
      }
    }),
    createSelectField({
      label: "Wall",
      options: WALL_OPTIONS,
      value: opening.wall,
      onInput: (value) => {
        opening.wall = value;
        touchState();
      }
    }),
    createInputField({
      label: "Approximate position along wall",
      type: "text",
      placeholder: "e.g. centered, left third",
      value: opening.position,
      onInput: (value) => {
        opening.position = value;
        touchState();
      }
    }),
    createInputField({
      label: "Approximate width (m)",
      type: "text",
      placeholder: 'Optional, or "not sure"',
      value: opening.widthMeters,
      onInput: (value) => {
        opening.widthMeters = value;
        touchState();
      }
    }),
    createInputField({
      label: "Connects to",
      type: "text",
      placeholder: "Adjoining room or outside",
      value: opening.connectsTo,
      onInput: (value) => {
        opening.connectsTo = value;
        touchState();
      }
    })
  );

  card.append(header, grid);
  return card;
}

function createInputField({
  label,
  type,
  value,
  onInput,
  placeholder = "",
  step = "",
  inputMode = ""
}) {
  const field = createElement("div", "field");
  const fieldLabel = document.createElement("label");
  const inputId = createId("field");
  fieldLabel.htmlFor = inputId;
  fieldLabel.textContent = label;
  const input = document.createElement("input");
  input.id = inputId;
  input.type = type;
  input.value = value || "";
  input.placeholder = placeholder;
  if (step) {
    input.step = step;
  }
  if (inputMode) {
    input.inputMode = inputMode;
  }
  input.addEventListener("input", () => onInput(input.value, input));
  field.append(fieldLabel, input);
  return field;
}

function createTextareaField({ label, value, onInput, hint = "" }) {
  const field = createElement("div", "field");
  const fieldLabel = document.createElement("label");
  const textareaId = createId("field");
  fieldLabel.htmlFor = textareaId;
  fieldLabel.textContent = label;
  const textarea = document.createElement("textarea");
  textarea.id = textareaId;
  textarea.value = value || "";
  textarea.addEventListener("input", () => onInput(textarea.value, textarea));
  field.append(fieldLabel, textarea);
  if (hint) {
    field.append(createElement("div", "hint", hint));
  }
  return field;
}

function createSelectField({ label, options, value, onInput }) {
  const field = createElement("div", "field");
  const fieldLabel = document.createElement("label");
  const selectId = createId("field");
  fieldLabel.htmlFor = selectId;
  fieldLabel.textContent = label;
  const select = document.createElement("select");
  select.id = selectId;
  options.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    if (optionValue === value) {
      option.selected = true;
    }
    select.append(option);
  });
  select.addEventListener("change", () => onInput(select.value, select));
  field.append(fieldLabel, select);
  return field;
}

function createElement(tagName, className = "", text = "") {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  return element;
}

function touchState() {
  state.updatedAt = new Date().toISOString();
  queueSave();
}

function queueSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state, null, 2));
    setSaveStatus(getSavedAtMessage(state.updatedAt));
  }, 250);
}

function setSaveStatus(message) {
  saveStatus.textContent = message;
}

function getSavedAtMessage(isoString) {
  if (!isoString) {
    return "";
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "Saved locally.";
  }
  return `Saved locally in this browser: ${date.toLocaleString()}`;
}

function exportJson() {
  const exportPayload = {
    ...state,
    exportedAt: new Date().toISOString(),
    exportNotes:
      "Keep this export private. Use it to back up your measurements or migrate them to another device or browser."
  };
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = EXPORT_FILE_NAME;
  link.click();
  URL.revokeObjectURL(url);
  setTransientStatus("Exported JSON download started.");
}

async function handleImport(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    state = normalizeState(parsed);
    activeFloorId = getFloor(activeFloorId) ? activeFloorId : FLOOR_DEFINITIONS[0].id;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state, null, 2));
    renderTabs();
    renderFloor();
    setSaveStatus(getSavedAtMessage(state.updatedAt));
    setTransientStatus(`Imported ${file.name}.`);
  } catch (error) {
    console.error("Import failed.", error);
    setTransientStatus("Import failed. Please choose a valid exported JSON file.");
  } finally {
    event.target.value = "";
  }
}

function setTransientStatus(message) {
  window.clearTimeout(transientMessageTimer);
  setSaveStatus(message);
  transientMessageTimer = window.setTimeout(() => {
    setSaveStatus(getSavedAtMessage(state.updatedAt));
  }, 2500);
}
