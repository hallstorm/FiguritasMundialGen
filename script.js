const DEFAULT_BG = "figurita_mundial_arg_panini_fondo.jpg";
const W = 1080,
  H = 1440;

const state = {
  bgImg: null,
  personImg: null,
  personX: 14,
  personY: 7,
  personW: 67,
  txtName: "DANTE",
  nameColor: "#ffffff",
  nameSize: 5,
  nameX: 4,
  nameY: 83,
  txtSub: "TEXTO DE EJEMPLO",
  subColor: "#ffffff",
  subSize: 3.2,
  subX: 4,
  subY: 89,
  txtExtra: "",
  extraColor: "#ffffff",
  extraSize: 3.2,
  extraX: 4,
  extraY: 95,
};

const preview = document.getElementById("preview-canvas");
const pctx = preview.getContext("2d");
const expCvs = document.getElementById("export-canvas");
const ectx = expCvs.getContext("2d");
const hint = document.getElementById("hint");
const wrapper = document.getElementById("canvas-wrapper");
const canvasArea = document.getElementById("canvas-area");
const touchOverlay = document.getElementById("touch-overlay");
const touchModeBar = document.getElementById("touch-mode-bar");
const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const loadingProgress = document.getElementById("loading-progress");
const errorBanner = document.getElementById("error-banner");

let removeBackgroundFn = null;

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.add("visible");
  setTimeout(() => errorBanner.classList.remove("visible"), 8000);
}

async function getRemoveBackground() {
  if (removeBackgroundFn) return removeBackgroundFn;

  loadingProgress.textContent = "Cargando librería MediaPipe…";
  const { ImageSegmenter, FilesetResolver } =
    await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs");

  loadingProgress.textContent = "Inicializando motor WASM…";
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
  );

  loadingProgress.textContent = "Cargando modelo de segmentación…";
  const segmenter = await ImageSegmenter.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite",
      delegate: "CPU",
    },
    outputCategoryMask: true,
    outputConfidenceMasks: false,
    runningMode: "IMAGE",
  });

  removeBackgroundFn = async (fileOrBlob) => {
    const url = URL.createObjectURL(fileOrBlob);
    const img = await loadImgFromSrc(url);
    URL.revokeObjectURL(url);

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const result = segmenter.segment(img);
    const maskData = result.categoryMask.getAsUint8Array();
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;

    // maskData[i] === 0 → persona, > 0 → fondo
    for (let i = 0; i < maskData.length; i++) {
      if (maskData[i] !== 0) pixels[i * 4 + 3] = 0;
    }

    ctx.putImageData(imgData, 0, 0);
    result.close();

    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  };

  return removeBackgroundFn;
}

let touchEditMode = false;
let selectedElement = null;
let canvasScale = 1;
let dragPointer = null;
let pinchStart = null;
let resizePointer = null; // { element, startClientX, startClientY, startSize }

const controls = {};

function showLoading(msg, progress) {
  loadingText.textContent = msg;
  loadingProgress.textContent = progress || "";
  loadingOverlay.classList.add("visible");
}
function hideLoading() {
  loadingOverlay.classList.remove("visible");
}

function loadImgFromSrc(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("No se pudo cargar: " + src));
    img.src = src;
  });
}

function loadImgFromFile(file) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = (e) => {
      const img = new Image();
      img.onload = () => res(img);
      img.src = e.target.result;
    };
    r.readAsDataURL(file);
  });
}

async function loadDefaultBackground() {
  try {
    state.bgImg = await loadImgFromSrc(DEFAULT_BG);
    errorBanner.classList.remove("visible");
    render();
  } catch {
    console.warn("Fondo predeterminado no encontrado:", DEFAULT_BG);
    showError(
      'No se encontró "' +
        DEFAULT_BG +
        '". Colocá el archivo junto a Index.html o usá "Cambiar fondo".',
    );
    render();
  }
}

function getPersonBounds(w, h) {
  if (!state.personImg) return null;
  const px = (state.personX / 100) * w;
  const py = (state.personY / 100) * h;
  const pw = (state.personW / 100) * w;
  const ph =
    pw * (state.personImg.naturalHeight / state.personImg.naturalWidth);
  return { x: px, y: py, w: pw, h: ph };
}

function getTextBounds(text, xPct, yPct, sizePct, weight, w, h) {
  const fs = (sizePct / 100) * w;
  pctx.save();
  pctx.font = `${weight} ${fs}px 'Arial Black','Arial',sans-serif`;
  const tw = pctx.measureText(text.toUpperCase()).width;
  pctx.restore();
  const x = (xPct / 100) * w;
  const y = (yPct / 100) * h;
  return { x, y: y - fs * 0.5, w: tw, h: fs };
}

function draw(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);

  if (state.bgImg) {
    ctx.drawImage(state.bgImg, 0, 0, w, h);
  } else {
    ctx.fillStyle = "#3ecfbf";
    ctx.fillRect(0, 0, w, h);
  }

  if (state.personImg) {
    const b = getPersonBounds(w, h);
    ctx.drawImage(state.personImg, b.x, b.y, b.w, b.h);
  }

  const nfs = (state.nameSize / 100) * w;
  ctx.save();
  ctx.fillStyle = state.nameColor;
  ctx.font = `900 ${nfs}px 'Arial Black','Arial',sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(
    state.txtName.toUpperCase(),
    (state.nameX / 100) * w,
    (state.nameY / 100) * h,
  );
  ctx.restore();

  const sfs = (state.subSize / 100) * w;
  ctx.save();
  ctx.fillStyle = state.subColor;
  ctx.font = `700 ${sfs}px 'Arial',sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(
    state.txtSub.toUpperCase(),
    (state.subX / 100) * w,
    (state.subY / 100) * h,
  );
  ctx.restore();

  if (state.txtExtra) {
    const efs = (state.extraSize / 100) * w;
    ctx.save();
    ctx.fillStyle = state.extraColor;
    ctx.font = `700 ${efs}px 'Arial',sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(
      state.txtExtra.toUpperCase(),
      (state.extraX / 100) * w,
      (state.extraY / 100) * h,
    );
    ctx.restore();
  }
}

function render() {
  draw(pctx, W, H);
  if (state.bgImg || state.personImg) hint.style.display = "none";
  else hint.style.display = "flex";
  updateSelectionBoxes();
}

function fitCanvas() {
  const area = canvasArea.getBoundingClientRect();
  const pad = window.innerWidth <= 860 ? 12 : 32;
  const availW = area.width - pad;
  const availH = area.height - pad;
  if (availW < 80 || availH < 80) return;
  canvasScale = Math.min(availW / W, availH / H);
  if (!isFinite(canvasScale) || canvasScale <= 0) return;
  const displayW = W * canvasScale;
  const displayH = H * canvasScale;
  wrapper.style.width = displayW + "px";
  wrapper.style.height = displayH + "px";
  updateSelectionBoxes();
}

function updateSelectionBoxes() {
  const selPerson = document.getElementById("sel-person");
  const selName = document.getElementById("sel-name");
  const selSub = document.getElementById("sel-sub");
  const selExtra = document.getElementById("sel-extra");

  const boxes = {
    person: selPerson,
    name: selName,
    sub: selSub,
    extra: selExtra,
  };

  Object.entries(boxes).forEach(([key, el]) => {
    el.classList.remove("visible");
    if (!touchEditMode) return;

    let b;
    if (key === "person") b = getPersonBounds(W, H);
    else if (key === "name")
      b = getTextBounds(
        state.txtName,
        state.nameX,
        state.nameY,
        state.nameSize,
        900,
        W,
        H,
      );
    else if (key === "sub")
      b = getTextBounds(
        state.txtSub,
        state.subX,
        state.subY,
        state.subSize,
        700,
        W,
        H,
      );
    else
      b = getTextBounds(
        state.txtExtra,
        state.extraX,
        state.extraY,
        state.extraSize,
        700,
        W,
        H,
      );

    if (!b || (key === "person" && !state.personImg)) return;
    if (key === "extra" && !state.txtExtra) return;

    const pad = key === "person" ? 4 : 6;
    el.style.left = ((b.x - pad) / W) * 100 + "%";
    el.style.top = ((b.y - pad) / H) * 100 + "%";
    el.style.width = ((b.w + pad * 2) / W) * 100 + "%";
    el.style.height = ((b.h + pad * 2) / H) * 100 + "%";
    el.classList.add("visible");
    if (selectedElement === key) el.style.borderWidth = "3px";
    else el.style.borderWidth = "2px";
  });
}

function canvasPointFromEvent(e) {
  const rect = wrapper.getBoundingClientRect();
  const touch = e.touches ? e.touches[0] : e;
  const cx = ((touch.clientX - rect.left) / rect.width) * W;
  const cy = ((touch.clientY - rect.top) / rect.height) * H;
  return {
    x: cx,
    y: cy,
    clientX: touch.clientX,
    clientY: touch.clientY,
  };
}

function hitTest(cx, cy) {
  const hits = [];

  if (state.personImg) {
    const b = getPersonBounds(W, H);
    if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) {
      hits.push({ type: "person", area: b.w * b.h });
    }
  }

  const nameB = getTextBounds(
    state.txtName,
    state.nameX,
    state.nameY,
    state.nameSize,
    900,
    W,
    H,
  );
  if (
    cx >= nameB.x &&
    cx <= nameB.x + nameB.w &&
    cy >= nameB.y &&
    cy <= nameB.y + nameB.h
  ) {
    hits.push({ type: "name", area: nameB.w * nameB.h });
  }

  const subB = getTextBounds(
    state.txtSub,
    state.subX,
    state.subY,
    state.subSize,
    700,
    W,
    H,
  );
  if (
    cx >= subB.x &&
    cx <= subB.x + subB.w &&
    cy >= subB.y &&
    cy <= subB.y + subB.h
  ) {
    hits.push({ type: "sub", area: subB.w * subB.h });
  }

  if (state.txtExtra) {
    const extraB = getTextBounds(
      state.txtExtra,
      state.extraX,
      state.extraY,
      state.extraSize,
      700,
      W,
      H,
    );
    if (
      cx >= extraB.x &&
      cx <= extraB.x + extraB.w &&
      cy >= extraB.y &&
      cy <= extraB.y + extraB.h
    ) {
      hits.push({ type: "extra", area: extraB.w * extraB.h });
    }
  }

  if (!hits.length) return null;
  hits.sort((a, b) => a.area - b.area);
  return hits[0].type;
}

function syncControlValues() {
  const sync = (id, val) => {
    const slider = document.getElementById(id);
    const num = document.getElementById(id + "-num");
    if (slider) slider.value = val;
    if (num) num.value = parseFloat(val.toFixed(1));
  };
  sync("person-x", state.personX);
  sync("person-y", state.personY);
  sync("person-w", state.personW);
  sync("name-x", state.nameX);
  sync("name-y", state.nameY);
  sync("sub-x", state.subX);
  sync("sub-y", state.subY);
  sync("extra-x", state.extraX);
  sync("extra-y", state.extraY);
  document.getElementById("name-size-val").textContent =
    state.nameSize.toFixed(1) + "%";
  document.getElementById("sub-size-val").textContent =
    state.subSize.toFixed(1) + "%";
  document.getElementById("extra-size-val").textContent =
    state.extraSize.toFixed(1) + "%";
}

function moveElement(type, dxPct, dyPct) {
  if (type === "person") {
    state.personX = clamp(state.personX + dxPct, -100, 100);
    state.personY = clamp(state.personY + dyPct, -100, 100);
  } else if (type === "name") {
    state.nameX = clamp(state.nameX + dxPct, -100, 200);
    state.nameY = clamp(state.nameY + dyPct, -100, 200);
  } else if (type === "sub") {
    state.subX = clamp(state.subX + dxPct, -100, 200);
    state.subY = clamp(state.subY + dyPct, -100, 200);
  } else if (type === "extra") {
    state.extraX = clamp(state.extraX + dxPct, -100, 200);
    state.extraY = clamp(state.extraY + dyPct, -100, 200);
  }
  syncControlValues();
  render();
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function setTouchEditMode(on) {
  touchEditMode = on;
  document.getElementById("touch-edit-toggle").checked = on;
  document.getElementById("btn-touch-mode").classList.toggle("active", on);
  document.getElementById("tb-touch").classList.toggle("active", on);
  touchOverlay.classList.toggle("active", on);
  touchModeBar.classList.toggle("visible", on);
  wrapper.classList.toggle("touch-active", on);
  document.getElementById("drag-status").textContent = on
    ? "Modo edición: activado"
    : "Modo edición: desactivado";
  if (!on) {
    selectedElement = null;
    dragPointer = null;
    resizePointer = null;
  }
  updateSelectionBoxes();
}

/* Permite coma o punto como separador decimal */
function parseDecimal(str) {
  return parseFloat(String(str).replace(",", "."));
}

function bindPos(id, stateKey) {
  const slider = document.getElementById(id);
  const numbox = document.getElementById(id + "-num");
  controls[stateKey] = { slider, numbox };

  function applyValue(v, setNumbox = true) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    v = clamp(v, min, max);
    if (isNaN(v)) return;
    state[stateKey] = v;
    slider.value = v;
    /* Solo sobreescribir el numbox cuando NO viene de su propio input
                       para no interrumpir al usuario mientras escribe */
    if (setNumbox) numbox.value = parseFloat(v.toFixed(2));
    render();
  }

  slider.addEventListener("input", (e) =>
    applyValue(parseFloat(e.target.value)),
  );
  /* Durante el tipeo: parsear pero no reemplazar lo que escribe */
  numbox.addEventListener("input", (e) => {
    const v = parseDecimal(e.target.value);
    if (!isNaN(v)) applyValue(v, false);
  });
  /* Al confirmar (Enter / foco): normalizar el valor */
  numbox.addEventListener("change", (e) =>
    applyValue(parseDecimal(e.target.value)),
  );
}

function bindSize(id, stateKey, spanId) {
  const slider = document.getElementById(id);
  const span = document.getElementById(spanId);
  slider.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    state[stateKey] = v;
    if (span) span.textContent = v.toFixed(1) + "%";
    render();
  });
}

function bindInput(id, stateKey) {
  document.getElementById(id).addEventListener("input", (e) => {
    state[stateKey] = e.target.value;
    render();
  });
}

/* ── Touch / pointer drag ── */
function onPointerDown(e) {
  if (!touchEditMode) return;
  e.preventDefault();

  /* ─ Resize handle ─ */
  if (e.target.classList.contains("resize-handle")) {
    const elem = e.target.dataset.element;
    let startSize = 0;
    if (elem === "person") startSize = state.personW;
    else if (elem === "name") startSize = state.nameSize;
    else if (elem === "sub") startSize = state.subSize;
    else if (elem === "extra") startSize = state.extraSize;
    const touch = e.touches ? e.touches[0] : e;
    resizePointer = {
      element: elem,
      startClientX: touch.clientX,
      startClientY: touch.clientY,
      startSize,
    };
    dragPointer = null;
    pinchStart = null;
    selectedElement = elem;
    updateSelectionBoxes();
    return;
  }

  /* ─ Pinch (2 dedos) ─ */
  if (e.touches && e.touches.length === 2) {
    resizePointer = null;
    dragPointer = null;
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );
    pinchStart = { dist, personW: state.personW };
    selectedElement = "person";
    return;
  }

  /* ─ Drag normal ─ */
  resizePointer = null;
  const pt = canvasPointFromEvent(e);
  const hit = hitTest(pt.x, pt.y);
  selectedElement = hit;
  if (hit) {
    dragPointer = {
      x: pt.clientX,
      y: pt.clientY,
      startX: pt.x,
      startY: pt.y,
    };
  }
  updateSelectionBoxes();
}

function onPointerMove(e) {
  if (!touchEditMode) return;

  /* ─ Resize ─ */
  if (resizePointer) {
    e.preventDefault();
    const touch = e.touches ? e.touches[0] : e;
    const dx = touch.clientX - resizePointer.startClientX;
    const rect = wrapper.getBoundingClientRect();
    if (resizePointer.element === "person") {
      /* Arrastrar = % del ancho del canvas */
      state.personW = clamp(
        resizePointer.startSize + (dx / rect.width) * 100,
        5,
        150,
      );
    } else if (resizePointer.element === "name") {
      state.nameSize = clamp(
        resizePointer.startSize + (dx / rect.width) * 20,
        0.5,
        10,
      );
    } else if (resizePointer.element === "sub") {
      state.subSize = clamp(
        resizePointer.startSize + (dx / rect.width) * 16,
        0.5,
        8,
      );
    } else if (resizePointer.element === "extra") {
      state.extraSize = clamp(
        resizePointer.startSize + (dx / rect.width) * 16,
        0.5,
        8,
      );
    }
    syncControlValues();
    render();
    return;
  }

  /* ─ Pinch (2 dedos) ─ */
  if (e.touches && e.touches.length === 2 && pinchStart && state.personImg) {
    e.preventDefault();
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );
    const ratio = dist / pinchStart.dist;
    state.personW = clamp(pinchStart.personW * ratio, 5, 150);
    syncControlValues();
    render();
    return;
  }

  /* ─ Drag normal ─ */
  if (!dragPointer || !selectedElement) return;
  e.preventDefault();

  const pt = canvasPointFromEvent(e);
  const rect = wrapper.getBoundingClientRect();
  const dxPct = ((pt.clientX - dragPointer.x) / rect.width) * 100;
  const dyPct = ((pt.clientY - dragPointer.y) / rect.height) * 100;

  if (selectedElement === "person") {
    state.personX = clamp(state.personX + dxPct, -100, 100);
    state.personY = clamp(state.personY + dyPct, -100, 100);
  } else if (selectedElement === "name") {
    state.nameX = clamp(state.nameX + dxPct, -100, 200);
    state.nameY = clamp(state.nameY + dyPct, -100, 200);
  } else if (selectedElement === "sub") {
    state.subX = clamp(state.subX + dxPct, -100, 200);
    state.subY = clamp(state.subY + dyPct, -100, 200);
  } else if (selectedElement === "extra") {
    state.extraX = clamp(state.extraX + dxPct, -100, 200);
    state.extraY = clamp(state.extraY + dyPct, -100, 200);
  }

  dragPointer.x = pt.clientX;
  dragPointer.y = pt.clientY;
  syncControlValues();
  render();
}

function onPointerUp() {
  dragPointer = null;
  pinchStart = null;
  resizePointer = null;
}

touchOverlay.addEventListener("touchstart", onPointerDown, {
  passive: false,
});
touchOverlay.addEventListener("touchmove", onPointerMove, {
  passive: false,
});
touchOverlay.addEventListener("touchend", onPointerUp);
touchOverlay.addEventListener("touchcancel", onPointerUp);

/* Desktop: mouse drag when touch mode on */
touchOverlay.addEventListener("mousedown", onPointerDown);
window.addEventListener("mousemove", onPointerMove);
window.addEventListener("mouseup", onPointerUp);

/* ── Mobile sidebar ── */
const sidebar = document.getElementById("sidebar");
const backdrop = document.getElementById("sidebar-backdrop");

function openSidebar() {
  sidebar.classList.add("open");
  backdrop.classList.add("visible");
}
function closeSidebar() {
  sidebar.classList.remove("open");
  backdrop.classList.remove("visible");
}
function toggleSidebar() {
  sidebar.classList.toggle("open");
  backdrop.classList.toggle("visible");
}

document
  .getElementById("touch-exit-btn")
  .addEventListener("click", () => setTouchEditMode(false));

document.getElementById("btn-menu").addEventListener("click", toggleSidebar);
document.getElementById("tb-controls").addEventListener("click", toggleSidebar);
backdrop.addEventListener("click", closeSidebar);

/* Collapsible panels */
document.querySelectorAll("[data-panel]").forEach((panel) => {
  panel.querySelector(".panel-head").addEventListener("click", () => {
    panel.classList.toggle("collapsed");
  });
});

/* ── Touch mode toggles ── */
document.getElementById("touch-edit-toggle").addEventListener("change", (e) => {
  setTouchEditMode(e.target.checked);
});
document.getElementById("btn-touch-mode").addEventListener("click", () => {
  setTouchEditMode(!touchEditMode);
});
document.getElementById("tb-touch").addEventListener("click", () => {
  setTouchEditMode(!touchEditMode);
});

/* ── File uploads ── */
document.getElementById("bg-upload").addEventListener("change", async (e) => {
  if (e.target.files[0]) {
    state.bgImg = await loadImgFromFile(e.target.files[0]);
    render();
  }
});

document
  .getElementById("btn-reset-bg")
  .addEventListener("click", loadDefaultBackground);

document
  .getElementById("person-upload")
  .addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const removeBg = document.getElementById("remove-bg-check").checked;

    try {
      if (removeBg) {
        showLoading(
          "Quitando fondo con IA…",
          "La primera vez puede tardar unos minutos",
        );
        const removeBackground = await getRemoveBackground();
        const config = {
          progress: (key, current, total) => {
            if (total > 0) {
              loadingProgress.textContent = `${key}: ${Math.round((current / total) * 100)}%`;
            }
          },
        };
        const blob = await removeBackground(file);
        const url = URL.createObjectURL(blob);
        state.personImg = await loadImgFromSrc(url);
        URL.revokeObjectURL(url);
      } else {
        state.personImg = await loadImgFromFile(file);
      }
      render();
    } catch (err) {
      console.error(err);
      alert(
        "No se pudo quitar el fondo. Se cargó la foto original.\n\n" +
          (err.message || err),
      );
      state.personImg = await loadImgFromFile(file);
      render();
    } finally {
      hideLoading();
      e.target.value = "";
    }
  });

/* ── Wire controls ── */
bindPos("person-x", "personX");
bindPos("person-y", "personY");
bindPos("person-w", "personW");
bindInput("txt-name", "txtName");
bindInput("name-color", "nameColor");
bindSize("name-size", "nameSize", "name-size-val");
bindPos("name-x", "nameX");
bindPos("name-y", "nameY");
bindInput("txt-sub", "txtSub");
bindInput("sub-color", "subColor");
bindSize("sub-size", "subSize", "sub-size-val");
bindPos("sub-x", "subX");
bindPos("sub-y", "subY");
bindInput("txt-extra", "txtExtra");
bindInput("extra-color", "extraColor");
bindSize("extra-size", "extraSize", "extra-size-val");
bindPos("extra-x", "extraX");
bindPos("extra-y", "extraY");

function doExport() {
  draw(ectx, W, H);
  const link = document.createElement("a");
  link.download = "figurita_mundial_2026.png";
  link.href = expCvs.toDataURL("image/png");
  link.click();
}

document.getElementById("btn-export").addEventListener("click", () => {
  doExport();
  closeSidebar();
});
document.getElementById("tb-export").addEventListener("click", doExport);

window.addEventListener("resize", fitCanvas);
window.addEventListener("orientationchange", () => setTimeout(fitCanvas, 100));

/* Inicialización — no depende de imports externos */
render();
loadDefaultBackground();

/* Abrir sidebar en mobile por default */
if (window.innerWidth <= 860) {
  sidebar.classList.add("open");
  backdrop.classList.add("visible");
}
requestAnimationFrame(() => {
  fitCanvas();
});
window.addEventListener("load", fitCanvas);
