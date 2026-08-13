(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const canvas = document.getElementById('figureCanvas');
  if (!canvas) return;
  const $ = id => document.getElementById(id);
  let active = null;
  let interaction = null;
  const localHistory = [];

  const svgEl = (tag, attrs = {}) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };

  function pointToSvg(event) {
    const point = canvas.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    return point.matrixTransform(canvas.getScreenCTM()?.inverse() || new DOMMatrix());
  }

  function visualBox(root) {
    const rect = root.getBoundingClientRect();
    const p1 = pointToSvg({ clientX: rect.left, clientY: rect.top });
    const p2 = pointToSvg({ clientX: rect.right, clientY: rect.bottom });
    return { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), width: Math.abs(p2.x - p1.x), height: Math.abs(p2.y - p1.y) };
  }

  function cleanOverlays() {
    canvas.querySelectorAll('.advanced-handle,.advanced-rotate,.advanced-rotation-line').forEach(node => node.remove());
  }

  function renderControls() {
    cleanOverlays();
    if (!active || !active.isConnected) return;
    const b = visualBox(active);
    const points = [[b.x, b.y, 'nwse-resize'], [b.x + b.width, b.y, 'nesw-resize'], [b.x, b.y + b.height, 'nesw-resize'], [b.x + b.width, b.y + b.height, 'nwse-resize']];
    points.forEach(([x, y, cursor]) => { const handle = svgEl('rect', { x: x - 6, y: y - 6, width: 12, height: 12, rx: 3, class: 'advanced-handle' }); handle.dataset.cursor = cursor; handle.addEventListener('pointerdown', event => beginResize(event, x, y)); canvas.append(handle); });
    canvas.append(svgEl('line', { x1: b.x + b.width / 2, y1: b.y, x2: b.x + b.width / 2, y2: b.y - 30, class: 'advanced-rotation-line' }));
    const rotate = svgEl('circle', { cx: b.x + b.width / 2, cy: b.y - 38, r: 7, class: 'advanced-rotate' });
    rotate.addEventListener('pointerdown', event => beginRotate(event, b));
    canvas.append(rotate);
  }

  function activeRoot(event) {
    const target = event.target.closest?.('g[data-editable], image[data-editable]');
    if (!target || target.closest('defs') || target.classList.contains('advanced-handle') || target.classList.contains('advanced-rotate')) return;
    active = target;
    setTimeout(renderControls, 0);
  }

  function pushHistory() {
    localHistory.push(canvas.innerHTML);
    if (localHistory.length > 20) localHistory.shift();
  }

  function beginResize(event, anchorX, anchorY) {
    if (!active) return;
    event.preventDefault(); event.stopPropagation();
    pushHistory();
    const b = visualBox(active);
    const oppositeX = anchorX === b.x ? b.x + b.width : b.x;
    const oppositeY = anchorY === b.y ? b.y + b.height : b.y;
    interaction = { type: 'resize', start: pointToSvg(event), b, oppositeX, oppositeY };
    window.addEventListener('pointermove', resizeMove);
    window.addEventListener('pointerup', endInteraction, { once: true });
  }

  function resizeMove(event) {
    if (!interaction || !active) return;
    const p = pointToSvg(event);
    let width = Math.max(28, Math.abs(p.x - interaction.oppositeX));
    let height = Math.max(28, Math.abs(p.y - interaction.oppositeY));
    if (event.shiftKey) { const ratio = interaction.b.width / Math.max(1, interaction.b.height); if (width / height > ratio) height = width / ratio; else width = height * ratio; }
    const sx = width / Math.max(1, interaction.b.width);
    const sy = height / Math.max(1, interaction.b.height);
    const cx = interaction.b.x + interaction.b.width / 2;
    const cy = interaction.b.y + interaction.b.height / 2;
    const previous = active.getAttribute('data-advanced-transform') || active.getAttribute('transform') || '';
    active.setAttribute('data-advanced-transform', previous);
    active.setAttribute('transform', `translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy}) ${previous}`.trim());
    renderControls();
    event.preventDefault();
  }

  function beginRotate(event, b) {
    if (!active) return;
    event.preventDefault(); event.stopPropagation();
    pushHistory();
    interaction = { type: 'rotate', center: { x: b.x + b.width / 2, y: b.y + b.height / 2 } };
    window.addEventListener('pointermove', rotateMove);
    window.addEventListener('pointerup', endInteraction, { once: true });
  }

  function rotateMove(event) {
    if (!interaction || !active) return;
    const p = pointToSvg(event);
    const angle = Math.atan2(p.y - interaction.center.y, p.x - interaction.center.x) * 180 / Math.PI + 90;
    const previous = active.getAttribute('data-advanced-transform') || active.getAttribute('transform') || '';
    active.setAttribute('data-advanced-transform', previous);
    active.setAttribute('transform', `rotate(${angle} ${interaction.center.x} ${interaction.center.y}) ${previous}`.trim());
    renderControls();
    event.preventDefault();
  }

  function endInteraction() {
    interaction = null;
    window.removeEventListener('pointermove', resizeMove);
    window.removeEventListener('pointermove', rotateMove);
    renderControls();
    $('status').textContent = '宸插畬鎴愮缉鏀炬垨鏃嬭浆';
  }

  function projectSvg() {
    const clone = canvas.cloneNode(true);
    clone.querySelectorAll('.selected-outline,.canva-selection,.canva-handle,.canva-guide,.canva-marquee,.advanced-handle,.advanced-rotate,.advanced-rotation-line').forEach(node => node.remove());
    clone.setAttribute('xmlns', NS);
    return new XMLSerializer().serializeToString(clone);
  }

  function saveProject() {
    const payload = { format: 'FigureYa.figure', version: 1, createdAt: new Date().toISOString(), viewBox: canvas.getAttribute('viewBox'), svg: projectSvg() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'figureya-project.figure.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
    $('status').textContent = '宸蹭繚瀛?FigureYa 椤圭洰鏂囦欢';
  }

  function refreshPanelList() {
    const list = $('panelList'); if (!list) return;
    list.replaceChildren();
    canvas.querySelectorAll('g[data-panel]').forEach(panel => {
      const row = document.createElement('div'); row.className = 'panel-item';
      row.innerHTML = `<span>${panel.dataset.panel || '鈥?}</span><span>${panel.querySelector('[data-role="panel-title"]')?.textContent || 'Panel'}</span>`;
      row.addEventListener('click', () => { active = panel; renderControls(); }); list.append(row);
    });
  }

  function loadProject(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        if (!payload.svg || payload.format !== 'FigureYa.figure') throw new Error('unsupported');
        canvas.innerHTML = payload.svg.replace(/^.*?<svg[^>]*>|<\/svg>.*$/gs, '');
        if (payload.viewBox) canvas.setAttribute('viewBox', payload.viewBox);
        active = null; cleanOverlays(); refreshPanelList();
        $('status').textContent = '宸插姞杞?FigureYa 椤圭洰鏂囦欢';
      } catch { $('status').textContent = '椤圭洰鏂囦欢鏃犳硶璇诲彇'; }
    };
    reader.readAsText(file);
  }

  canvas.addEventListener('pointerdown', activeRoot, false);
  canvas.addEventListener('click', activeRoot, false);
  canvas.addEventListener('pointerup', () => setTimeout(renderControls, 0), false);
  window.addEventListener('resize', renderControls);
  $('saveProject')?.addEventListener('click', saveProject);
  $('projectInput')?.addEventListener('change', event => { if (event.target.files[0]) loadProject(event.target.files[0]); event.target.value = ''; });
  document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveProject(); } });
  $('loadDemo')?.addEventListener('click', () => { active = null; setTimeout(() => { refreshPanelList(); renderControls(); }, 30); });
  $('addPanel')?.addEventListener('click', () => setTimeout(refreshPanelList, 30));
  refreshPanelList();
})();
