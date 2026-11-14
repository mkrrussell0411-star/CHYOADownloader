(function () {
  "use strict";

  const VIEWER_VERSION = "5";
  const MIN_ZOOM_FRACTION = 0.15;
  const MAX_ZOOM_PERCENT = 10000;
  const MAX_ZOOM_MULTIPLIER = MAX_ZOOM_PERCENT / 100;

  const els = {
    viewportWrap: document.getElementById("viewport-wrap"),
    viewport: document.getElementById("viewport"),
    inner: document.getElementById("viewport-inner"),
    fileInput: document.getElementById("file-input"),
    fileInputMobile: document.getElementById("file-input-mobile"),
    fitBtn: document.getElementById("fit-btn"),
    fitBtnD: document.getElementById("fit-btn-d"),
    zoomInBtn: document.getElementById("zoom-in"),
    zoomOutBtn: document.getElementById("zoom-out"),
    zoomInBtnD: document.getElementById("zoom-in-d"),
    zoomOutBtnD: document.getElementById("zoom-out-d"),
    zoomReadout: document.getElementById("zoom-readout"),
    zoomReadoutD: document.getElementById("zoom-readout-d"),
    title: document.getElementById("doc-title"),
    loading: document.getElementById("loading"),
  };

  let svgRoot = null;
  let worldX = 0;
  let worldY = 0;
  let worldW = 0;
  let worldH = 0;
  let viewX = 0;
  let viewY = 0;
  let viewW = 0;
  let viewH = 0;
  let fitViewW = 1;

  let pointers = new Map();
  let dragStart = null;
  let pinchStart = null;
  let touchBlocker = null;

  function setLoading(on) {
    els.loading.classList.toggle("visible", on);
  }

  function setZoomLabel(pct) {
    const text = `${pct}%`;
    if (els.zoomReadout) els.zoomReadout.textContent = text;
    if (els.zoomReadoutD) els.zoomReadoutD.textContent = text;
  }

  function parseSvgSize(svgEl) {
    const vb = svgEl.getAttribute("viewBox");
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
        return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
      }
    }
    const w = parseFloat(svgEl.getAttribute("width")) || 0;
    const h = parseFloat(svgEl.getAttribute("height")) || 0;
    if (w > 0 && h > 0) {
      return { x: 0, y: 0, w, h };
    }
    const box = svgEl.getBBox();
    return { x: box.x || 0, y: box.y || 0, w: box.width || 800, h: box.height || 600 };
  }

  function viewportAspect() {
    const vw = els.viewport.clientWidth;
    const vh = els.viewport.clientHeight;
    return vw > 0 && vh > 0 ? vw / vh : worldW / worldH || 1;
  }

  function clientToSvg(clientX, clientY) {
    if (!svgRoot) {
      return null;
    }
    const pt = svgRoot.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svgRoot.getScreenCTM();
    if (!ctm) {
      return null;
    }
    return pt.matrixTransform(ctm.inverse());
  }

  function screenDeltaToWorld(dx, dy) {
    const vw = els.viewport.clientWidth || 1;
    const vh = els.viewport.clientHeight || 1;
    return { dx: (dx / vw) * viewW, dy: (dy / vh) * viewH };
  }

  function applyViewBox() {
    if (!svgRoot) {
      return;
    }
    svgRoot.setAttribute("viewBox", `${viewX} ${viewY} ${viewW} ${viewH}`);
    const pct = fitViewW > 0 ? Math.round((fitViewW / viewW) * 100) : 100;
    setZoomLabel(pct);
  }

  function clampViewW(nextW) {
    const minW = fitViewW / MAX_ZOOM_MULTIPLIER;
    const maxW = fitViewW / MIN_ZOOM_FRACTION;
    return Math.min(maxW, Math.max(minW, nextW));
  }

  function setViewSize(newW) {
    viewW = clampViewW(newW);
    viewH = viewW / viewportAspect();
  }

  function fitToView() {
    if (!svgRoot || !worldW || !worldH) {
      return;
    }
    viewX = worldX;
    viewY = worldY;
    viewW = worldW;
    viewH = worldH;
    fitViewW = worldW;
    applyViewBox();
  }

  function onViewportResize() {
    if (!svgRoot) {
      return;
    }
    viewH = viewW / viewportAspect();
    applyViewBox();
  }

  function zoomAt(factor, clientX, clientY) {
    if (!svgRoot) {
      return;
    }
    const pt = clientToSvg(clientX, clientY);
    if (!pt) {
      return;
    }
    const oldW = viewW;
    const oldH = viewH;
    const fx = oldW > 0 ? (pt.x - viewX) / oldW : 0.5;
    const fy = oldH > 0 ? (pt.y - viewY) / oldH : 0.5;
    setViewSize(oldW / factor);
    viewX = pt.x - fx * viewW;
    viewY = pt.y - fy * viewH;
    applyViewBox();
  }

  function clearSvg() {
    while (els.inner.firstChild) {
      els.inner.removeChild(els.inner.firstChild);
    }
    els.viewportWrap.classList.remove("has-svg");
    document.body.classList.remove("is-viewing");
    svgRoot = null;
    worldW = worldH = 0;
    viewX = viewY = 0;
    viewW = viewH = fitViewW = 1;
    setZoomLabel("—");
    disableTouchBlock();
  }

  function enableTouchBlock() {
    if (touchBlocker) {
      return;
    }
    touchBlocker = (e) => {
      if (els.viewportWrap.classList.contains("has-svg")) {
        e.preventDefault();
      }
    };
    document.addEventListener("touchmove", touchBlocker, { passive: false });
    document.addEventListener("gesturestart", touchBlocker, { passive: false });
    document.addEventListener("gesturechange", touchBlocker, { passive: false });
  }

  function disableTouchBlock() {
    if (!touchBlocker) {
      return;
    }
    document.removeEventListener("touchmove", touchBlocker);
    document.removeEventListener("gesturestart", touchBlocker);
    document.removeEventListener("gesturechange", touchBlocker);
    touchBlocker = null;
  }

  async function loadSvgFromFile(file) {
    if (!file || (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml")) {
      alert("Please choose an .svg file.");
      return;
    }
    setLoading(true);
    try {
      const text = await file.text();
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const parseErr = doc.querySelector("parsererror");
      if (parseErr) {
        throw new Error("Invalid SVG.");
      }
      const svg = doc.documentElement;
      if (svg.localName !== "svg") {
        throw new Error("File is not an SVG.");
      }
      clearSvg();
      const imported = document.importNode(svg, true);
      imported.setAttribute("width", "100%");
      imported.setAttribute("height", "100%");
      imported.setAttribute("preserveAspectRatio", "xMidYMid meet");
      els.inner.appendChild(imported);
      svgRoot = imported;
      els.viewportWrap.classList.add("has-svg");
      document.body.classList.add("is-viewing");
      enableTouchBlock();
      els.title.textContent = file.name.replace(/\.svg$/i, "");
      const size = parseSvgSize(imported);
      worldX = size.x;
      worldY = size.y;
      worldW = size.w;
      worldH = size.h;
      requestAnimationFrame(() => {
        fitToView();
        setLoading(false);
      });
    } catch (e) {
      setLoading(false);
      alert(e.message || "Could not load SVG.");
    }
  }

  function onPointerDown(ev) {
    if (!els.viewportWrap.classList.contains("has-svg")) {
      return;
    }
    if (ev.pointerType === "mouse" && ev.button !== 0) {
      return;
    }
    ev.preventDefault();
    els.viewportWrap.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 1) {
      dragStart = {
        x: ev.clientX,
        y: ev.clientY,
        viewX,
        viewY,
      };
      els.viewportWrap.classList.add("is-dragging");
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const pt = clientToSvg(midX, midY);
      pinchStart = {
        dist,
        viewW,
        viewX,
        viewY,
        viewH,
        focusX: pt?.x,
        focusY: pt?.y,
      };
      dragStart = null;
    }
  }

  function onPointerMove(ev) {
    if (!pointers.has(ev.pointerId)) {
      return;
    }
    ev.preventDefault();
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size >= 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart.dist < 2) {
        pinchStart.dist = dist;
        return;
      }
      const scaleFactor = dist / pinchStart.dist;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      let pt = clientToSvg(midX, midY);
      if (!pt && pinchStart.focusX != null) {
        pt = { x: pinchStart.focusX, y: pinchStart.focusY };
      }
      if (!pt) {
        pt = { x: viewX + viewW / 2, y: viewY + viewH / 2 };
      }
      const fx = viewW > 0 ? (pt.x - viewX) / viewW : 0.5;
      const fy = viewH > 0 ? (pt.y - viewY) / viewH : 0.5;
      setViewSize(viewW / scaleFactor);
      viewX = pt.x - fx * viewW;
      viewY = pt.y - fy * viewH;
      pinchStart.dist = dist;
      applyViewBox();
      return;
    }

    if (dragStart && pointers.size === 1) {
      const dx = ev.clientX - dragStart.x;
      const dy = ev.clientY - dragStart.y;
      const d = screenDeltaToWorld(dx, dy);
      viewX = dragStart.viewX - d.dx;
      viewY = dragStart.viewY - d.dy;
      applyViewBox();
    }
  }

  function onPointerUp(ev) {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) {
      pinchStart = null;
    }
    if (pointers.size === 0) {
      dragStart = null;
      els.viewportWrap.classList.remove("is-dragging");
    } else if (pointers.size === 1) {
      const only = [...pointers.entries()][0][1];
      dragStart = { x: only.x, y: only.y, viewX, viewY };
    }
    try {
      els.viewportWrap.releasePointerCapture(ev.pointerId);
    } catch (_) {
      /* already released */
    }
  }

  function onWheel(ev) {
    if (!els.viewportWrap.classList.contains("has-svg")) {
      return;
    }
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(factor, ev.clientX, ev.clientY);
  }

  function setupDrop() {
    const stop = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    ["dragenter", "dragover", "dragleave", "drop"].forEach((type) => {
      document.body.addEventListener(type, stop);
    });
    document.body.addEventListener("drop", (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        loadSvgFromFile(file);
      }
    });
  }

  function hookFileInput(input) {
    if (!input) return;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) {
        loadSvgFromFile(file);
      }
      input.value = "";
    });
  }

  function hookButtons(fit, zoomIn, zoomOut) {
    fit?.addEventListener("click", (e) => {
      e.preventDefault();
      fitToView();
    });
    zoomIn?.addEventListener("click", (e) => {
      e.preventDefault();
      const r = els.viewport.getBoundingClientRect();
      zoomAt(1.25, r.left + r.width / 2, r.top + r.height / 2);
    });
    zoomOut?.addEventListener("click", (e) => {
      e.preventDefault();
      const r = els.viewport.getBoundingClientRect();
      zoomAt(1 / 1.25, r.left + r.width / 2, r.top + r.height / 2);
    });
  }

  hookFileInput(els.fileInput);
  hookFileInput(els.fileInputMobile);
  hookButtons(els.fitBtn, els.zoomInBtn, els.zoomOutBtn);
  hookButtons(els.fitBtnD, els.zoomInBtnD, els.zoomOutBtnD);

  els.viewportWrap.addEventListener("dblclick", (ev) => {
    if (els.viewportWrap.classList.contains("has-svg")) {
      ev.preventDefault();
      fitToView();
    }
  });

  els.viewportWrap.addEventListener("pointerdown", onPointerDown, { passive: false });
  els.viewportWrap.addEventListener("pointermove", onPointerMove, { passive: false });
  els.viewportWrap.addEventListener("pointerup", onPointerUp);
  els.viewportWrap.addEventListener("pointercancel", onPointerUp);
  els.viewportWrap.addEventListener("wheel", onWheel, { passive: false });

  window.addEventListener("resize", onViewportResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onViewportResize);
  }

  setupDrop();
  setZoomLabel("—");

  window.CHYOA_VIEWER_VERSION = VIEWER_VERSION;
})();