(function () {
  "use strict";

  const PAD = 16;
  const MIN_ZOOM_FRACTION = 0.15;
  /** Max zoom vs fit-to-view (100% = fully zoomed out). */
  const MAX_ZOOM_PERCENT = 10000;
  const MAX_ZOOM_MULTIPLIER = MAX_ZOOM_PERCENT / 100;

  const els = {
    viewportWrap: document.getElementById("viewport-wrap"),
    viewport: document.getElementById("viewport"),
    inner: document.getElementById("viewport-inner"),
    fileInput: document.getElementById("file-input"),
    fitBtn: document.getElementById("fit-btn"),
    zoomInBtn: document.getElementById("zoom-in"),
    zoomOutBtn: document.getElementById("zoom-out"),
    zoomReadout: document.getElementById("zoom-readout"),
    title: document.getElementById("doc-title"),
    loading: document.getElementById("loading"),
  };

  let contentW = 0;
  let contentH = 0;
  let fitScale = 1;
  let scale = 1;
  let panX = 0;
  let panY = 0;

  let pointers = new Map();
  let dragStart = null;
  let pinchStart = null;

  function setLoading(on) {
    els.loading.classList.toggle("visible", on);
  }

  function parseSvgSize(svgEl) {
    const vb = svgEl.getAttribute("viewBox");
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
        return { w: parts[2], h: parts[3] };
      }
    }
    const w = parseFloat(svgEl.getAttribute("width")) || 0;
    const h = parseFloat(svgEl.getAttribute("height")) || 0;
    if (w > 0 && h > 0) {
      return { w, h };
    }
    const box = svgEl.getBBox();
    return { w: box.width || 800, h: box.height || 600 };
  }

  function applyTransform() {
    els.inner.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    const pct = fitScale > 0 ? Math.round((scale / fitScale) * 100) : 100;
    els.zoomReadout.textContent = `${pct}%`;
  }

  function fitToView() {
    const vw = els.viewport.clientWidth;
    const vh = els.viewport.clientHeight;
    if (!contentW || !contentH || !vw || !vh) {
      return;
    }
    fitScale = Math.min((vw - PAD * 2) / contentW, (vh - PAD * 2) / contentH);
    scale = fitScale;
    panX = (vw - contentW * scale) / 2;
    panY = (vh - contentH * scale) / 2;
    applyTransform();
  }

  function clampScale(next) {
    const minS = fitScale * MIN_ZOOM_FRACTION;
    const maxS = fitScale * MAX_ZOOM_MULTIPLIER;
    return Math.min(maxS, Math.max(minS, next));
  }

  function zoomAt(factor, clientX, clientY) {
    const rect = els.viewport.getBoundingClientRect();
    const vx = clientX - rect.left;
    const vy = clientY - rect.top;
    const worldX = (vx - panX) / scale;
    const worldY = (vy - panY) / scale;
    const next = clampScale(scale * factor);
    panX = vx - worldX * next;
    panY = vy - worldY * next;
    scale = next;
    applyTransform();
  }

  function clearSvg() {
    while (els.inner.firstChild) {
      els.inner.removeChild(els.inner.firstChild);
    }
    els.viewportWrap.classList.remove("has-svg");
    contentW = contentH = 0;
    fitScale = scale = 1;
    panX = panY = 0;
    applyTransform();
  }

  async function loadSvgFromFile(file) {
    if (!file || !/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") {
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
      els.inner.appendChild(imported);
      els.viewportWrap.classList.add("has-svg");
      els.title.textContent = file.name.replace(/\.svg$/i, "");
      const size = parseSvgSize(imported);
      contentW = size.w;
      contentH = size.h;
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
    els.viewportWrap.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 1) {
      dragStart = { x: ev.clientX, y: ev.clientY, panX, panY };
      els.viewportWrap.classList.add("is-dragging");
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStart = { dist, scale, panX, panY, midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
      dragStart = null;
    }
  }

  function onPointerMove(ev) {
    if (!pointers.has(ev.pointerId)) {
      return;
    }
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size >= 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart.dist < 1) {
        return;
      }
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const rect = els.viewport.getBoundingClientRect();
      const vx = midX - rect.left;
      const vy = midY - rect.top;
      const worldX = (vx - pinchStart.panX) / pinchStart.scale;
      const worldY = (vy - pinchStart.panY) / pinchStart.scale;
      const next = clampScale(pinchStart.scale * (dist / pinchStart.dist));
      panX = vx - worldX * next;
      panY = vy - worldY * next;
      scale = next;
      applyTransform();
      return;
    }

    if (dragStart && pointers.size === 1) {
      panX = dragStart.panX + (ev.clientX - dragStart.x);
      panY = dragStart.panY + (ev.clientY - dragStart.y);
      applyTransform();
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
      const only = [...pointers.entries()][0];
      dragStart = {
        x: only[1].x,
        y: only[1].y,
        panX,
        panY,
      };
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

  els.fileInput.addEventListener("change", () => {
    const file = els.fileInput.files?.[0];
    if (file) {
      loadSvgFromFile(file);
    }
    els.fileInput.value = "";
  });

  els.fitBtn.addEventListener("click", fitToView);
  els.viewportWrap.addEventListener("dblclick", (ev) => {
    if (els.viewportWrap.classList.contains("has-svg")) {
      ev.preventDefault();
      fitToView();
    }
  });
  els.zoomInBtn.addEventListener("click", () => {
    const r = els.viewport.getBoundingClientRect();
    zoomAt(1.25, r.left + r.width / 2, r.top + r.height / 2);
  });
  els.zoomOutBtn.addEventListener("click", () => {
    const r = els.viewport.getBoundingClientRect();
    zoomAt(1 / 1.25, r.left + r.width / 2, r.top + r.height / 2);
  });

  els.viewportWrap.addEventListener("pointerdown", onPointerDown);
  els.viewportWrap.addEventListener("pointermove", onPointerMove);
  els.viewportWrap.addEventListener("pointerup", onPointerUp);
  els.viewportWrap.addEventListener("pointercancel", onPointerUp);
  els.viewportWrap.addEventListener("wheel", onWheel, { passive: false });

  window.addEventListener("resize", () => {
    if (els.viewportWrap.classList.contains("has-svg")) {
      fitToView();
    }
  });

  setupDrop();
  applyTransform();
})();