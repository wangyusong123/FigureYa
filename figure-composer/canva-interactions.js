(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const canvas = document.getElementById('figureCanvas');
  if (!canvas) return;
  const $ = id => document.getElementById(id);
  const selection = new Set();
  const history = [];
  const future = [];
  let drag = null;
  let marquee = null;
  let internalClipboard = null;

  const svgEl = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    return el;
  };

  function rootFor(target) {
    if (!(target instanceof Element)) return null;
    return target.closest('g[data-editable], image[data-editable]');
  }

  function box(root) {
    if (root.dataset.x && root.dataset.y && root.dataset.w && root.dataset.h) {
      return { x: +root.dataset.x, y: +root.dataset.y, width: +root.dataset.w, height: +root.dataset.h };
    }
    const b = root.getBBox();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }

  function union(items) {
    if (!items.length) return { x: 0, y: 0, width: 0, height: 0 };
    const x1 = Math.min(...items.map(item => item.x));
    const y1 = Math.min(...items.map(item => item.y));
    const x2 = Math.max(...items.map(item => item.x + item.width));
    const y2 = Math.max(...items.map(item => item.y + item.height));
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }

  function snapshot() {
    return { html: canvas.innerHTML, viewBox: canvas.getAttribute('viewBox') };
  }

  function saveHistory() {
    history.push(snapshot());
    if (history.length > 40) history.shift();
    future.length = 0;
  }

  function restore(item) {
    if (!item) return;
    canvas.innerHTML = item.html;
    if (item.viewBox) canvas.setAttribute('viewBox', item.viewBox);
    selection.clear();
    renderSelection();
    $('status').textContent = '宸叉仮澶嶇紪杈戠姸鎬?;
  }

  function undo() {
    if (!history.length) return;
    future.push(snapshot());
    restore(history.pop());
  }

  function redo() {
    if (!future.length) return;
    history.push(snapshot());
    restore(future.pop());
  }

  function allRoots() {
    return [...canvas.querySelectorAll('g[data-editable], image[data-editable]')].filter(root => !root.closest('defs'));
  }

  function showToolbar() {
    const toolbar = $('contextToolbar');
    if (toolbar) toolbar.hidden = selection.size === 0;
    const info = $('selectionInfo');
    if (info) info.textContent = selection.size ? `宸查€夋嫨 ${selection.size} 涓璞?路 Ctrl/鈱?鍙閫塦 : '鏈€夋嫨鍏冪礌';
  }

  function clearSelectionOverlays() {
    canvas.querySelectorAll('.canva-selection,.canva-handle').forEach(node => node.remove());
  }

  function renderSelection() {
    clearSelectionOverlays();
    showToolbar();
    if (!selection.size) return;
    const boxes = [...selection].map(box);
    boxes.forEach(item => canvas.append(svgEl('rect', { x: item.x, y: item.y, width: item.width, height: item.height, class: 'canva-selection' })));
    const outer = union(boxes);
    canvas.append(svgEl('rect', { x: outer.x - 4, y: outer.y - 4, width: outer.width + 8, height: outer.height + 8, class: 'canva-selection' }));
    const handles = [[outer.x, outer.y], [outer.x + outer.width / 2, outer.y], [outer.x + outer.width, outer.y], [outer.x, outer.y + outer.height / 2], [outer.x + outer.width, outer.y + outer.height / 2], [outer.x, outer.y + outer.height], [outer.x + outer.width / 2, outer.y + outer.height], [outer.x + outer.width, outer.y + outer.height]];
    handles.forEach(([x, y]) => canvas.append(svgEl('rect', { x: x - 4, y: y - 4, width: 8, height: 8, rx: 2, class: 'canva-handle' })));
  }

  function select(root, additive = false) {
    if (!additive) selection.clear();
    if (root) {
      if (additive && selection.has(root)) selection.delete(root);
      else selection.add(root);
    }
    renderSelection();
  }

  function translateRoot(root, dx, dy, baseTransform) {
    if (root.tagName.toLowerCase() === 'image') {
      root.setAttribute('x', (+root.getAttribute('x') || 0) + dx);
      root.setAttribute('y', (+root.getAttribute('y') || 0) + dy);
      return;
    }
    root.setAttribute('transform', `translate(${dx},${dy})${baseTransform ? ` ${baseTransform}` : ''}`.trim());
    if (root.dataset.x) root.dataset.x = +root.dataset.x + dx;
    if (root.dataset.y) root.dataset.y = +root.dataset.y + dy;
  }

  function guideSnap(deltaX, deltaY, startBox) {
    const others = allRoots().filter(root => !selection.has(root));
    let bestX = { delta: deltaX, distance: 9, guide: null };
    let bestY = { delta: deltaY, distance: 9, guide: null };
    const moving = { ...startBox, x: startBox.x + deltaX, y: startBox.y + deltaY };
    const movingXs = [moving.x, moving.x + moving.width / 2, moving.x + moving.width];
    const movingYs = [moving.y, moving.y + moving.height / 2, moving.y + moving.height];
    for (const other of others) {
      const b = box(other);
      const targetXs = [b.x, b.x + b.width / 2, b.x + b.width];
      const targetYs = [b.y, b.y + b.height / 2, b.y + b.height];
      movingXs.forEach(x => targetXs.forEach(target => { const distance = Math.abs(x - target); if (distance < bestX.distance) bestX = { delta: deltaX + target - x, distance, guide: target }; }));
      movingYs.forEach(y => targetYs.forEach(target => { const distance = Math.abs(y - target); if (distance < bestY.distance) bestY = { delta: deltaY + target - y, distance, guide: target }; }));
    }
    const gridX = Math.round(moving.x / 10) * 10 - moving.x;
    const gridY = Math.round(moving.y / 10) * 10 - moving.y;
    if (Math.abs(gridX) < 4 && Math.abs(gridX) < bestX.distance) bestX = { delta: deltaX + gridX, distance: Math.abs(gridX), guide: Math.round(moving.x / 10) * 10 };
    if (Math.abs(gridY) < 4 && Math.abs(gridY) < bestY.distance) bestY = { delta: deltaY + gridY, distance: Math.abs(gridY), guide: Math.round(moving.y / 10) * 10 };
    return { dx: bestX.delta, dy: bestY.delta, gx: bestX.guide, gy: bestY.guide };
  }

  function drawGuides(gx, gy) {
    canvas.querySelectorAll('.canva-guide').forEach(node => node.remove());
    const vb = canvas.viewBox.baseVal;
    if (gx != null) canvas.append(svgEl('line', { x1: gx, y1: 0, x2: gx, y2: vb.height, class: 'canva-guide' }));
    if (gy != null) canvas.append(svgEl('line', { x1: 0, y1: gy, x2: vb.width, y2: gy, class: 'canva-guide' }));
    const status = $('guideStatus');
    if (status) status.textContent = gx != null || gy != null ? '宸插惛闄勫埌鍙傝€冪嚎' : '鎷栧姩鏃惰嚜鍔ㄥ惛闄?;
  }

  function beginDrag(event, root) {
    const startBoxes = [...selection].map(item => ({ root: item, box: box(item), transform: item.getAttribute('transform') || '' }));
    drag = { x: event.clientX, y: event.clientY, startBoxes, union: union(startBoxes.map(item => item.box)) };
    saveHistory();
  }

  function moveDrag(event) {
    if (!drag) return;
    const ctm = canvas.getScreenCTM();
    if (!ctm) return;
    const scaleX = ctm.a || 1;
    const scaleY = ctm.d || 1;
    const rawX = (event.clientX - drag.x) / scaleX;
    const rawY = (event.clientY - drag.y) / scaleY;
    const snapped = guideSnap(rawX, rawY, drag.union);
    drag.startBoxes.forEach(item => translateRoot(item.root, snapped.dx, snapped.dy, item.transform));
    renderSelection();
    drawGuides(snapped.gx, snapped.gy);
    event.preventDefault();
  }

  function endDrag() {
    if (!drag) return;
    drag = null;
    drawGuides(null, null);
    renderSelection();
    $('status').textContent = '浣嶇疆宸茶皟鏁达紝鍙户缁嫋鍔ㄦ垨浣跨敤瀵归綈宸ュ叿';
  }

  function intersects(a, b) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }

  function beginMarquee(event) {
    const ctm = canvas.getScreenCTM();
    const point = canvas.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const startSvg = point.matrixTransform(ctm?.inverse() || new DOMMatrix());
    const start = { clientX: event.clientX, clientY: event.clientY, x: startSvg.x, y: startSvg.y };
    marquee = { start, node: svgEl('rect', { class: 'canva-marquee' }) };
    canvas.append(marquee.node);
  }

  function moveMarquee(event) {
    if (!marquee) return;
    const ctm = canvas.getScreenCTM();
    const point = canvas.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const current = point.matrixTransform(ctm?.inverse() || new DOMMatrix());
    const p = { x: Math.min(marquee.start.x, current.x), y: Math.min(marquee.start.y, current.y), width: Math.abs(current.x - marquee.start.x), height: Math.abs(current.y - marquee.start.y) };
    marquee.node.setAttribute('x', p.x); marquee.node.setAttribute('y', p.y); marquee.node.setAttribute('width', p.width); marquee.node.setAttribute('height', p.height);
    selection.clear();
    allRoots().filter(root => intersects(box(root), p)).forEach(root => selection.add(root));
    renderSelection();
  }

  function endMarquee() { if (marquee) marquee.node.remove(); marquee = null; renderSelection(); }

  canvas.addEventListener('pointerdown', event => {
    if (event.target.classList?.contains('canva-selection') || event.target.classList?.contains('canva-handle')) return;
    const root = rootFor(event.target);
    if (root) {
      select(root, event.shiftKey || event.ctrlKey || event.metaKey);
      beginDrag(event, root);
    } else if (event.target === canvas) {
      select(null);
      beginMarquee(event);
    }
    event.stopPropagation();
  }, true);
  window.addEventListener('pointermove', event => { if (drag) moveDrag(event); else if (marquee) moveMarquee(event); });
  window.addEventListener('pointerup', () => { if (drag) endDrag(); if (marquee) endMarquee(); });

  function cloneSelection() {
    if (!selection.size) return;
    saveHistory();
    const clones = [...selection].map(root => { const copy = root.cloneNode(true); translateRoot(copy, 18, 18, copy.getAttribute('transform') || ''); if (copy.dataset.panel) copy.dataset.panel = `${copy.dataset.panel} copy`; canvas.append(copy); return copy; });
    selection.clear(); clones.forEach(copy => selection.add(copy)); renderSelection(); $('status').textContent = '宸插鍒跺璞?;
  }

  function deleteSelection() {
    if (!selection.size) return;
    saveHistory();
    [...selection].forEach(root => root.remove());
    selection.clear(); renderSelection(); $('status').textContent = '宸插垹闄ら€変腑瀵硅薄';
  }

  function groupSelection() {
    if (selection.size < 2) return;
    saveHistory();
    const group = svgEl('g', { 'data-editable': 'true', 'data-group': 'true' });
    const roots = [...selection];
    canvas.insertBefore(group, roots[0]); roots.forEach(root => group.append(root));
    selection.clear(); selection.add(group); renderSelection(); $('status').textContent = '宸茬紪缁勶紱鍙暣浣撴嫋鍔ㄥ拰瀵归綈';
  }

  function ungroupSelection() {
    const groups = [...selection].filter(root => root.dataset.group === 'true');
    if (!groups.length) return;
    saveHistory();
    const children = [];
    groups.forEach(group => { while (group.firstChild) { const child = group.firstChild; canvas.insertBefore(child, group); children.push(child); } group.remove(); });
    selection.clear(); children.forEach(child => selection.add(child)); renderSelection(); $('status').textContent = '宸茶В缁?;
  }

  function align(kind) {
    if (selection.size < 2) return;
    saveHistory();
    const items = [...selection].map(root => ({ root, box: box(root) }));
    const target = kind === 'top' ? Math.min(...items.map(item => item.box.y)) : kind === 'center' ? union(items.map(item => item.box)).x + union(items.map(item => item.box)).width / 2 : Math.min(...items.map(item => item.box.x));
    items.forEach(item => { const b = item.box; const dx = kind === 'top' ? 0 : kind === 'center' ? target - (b.x + b.width / 2) : target - b.x; const dy = kind === 'top' ? target - b.y : 0; translateRoot(item.root, dx, dy, item.root.getAttribute('transform') || ''); });
    renderSelection(); $('status').textContent = `宸?{kind === 'top' ? '椤剁' : kind === 'center' ? '姘村钩灞呬腑' : '宸?}瀵归綈`;
  }

  function nudge(dx, dy) { if (!selection.size) return; saveHistory(); [...selection].forEach(root => translateRoot(root, dx, dy, root.getAttribute('transform') || '')); renderSelection(); }

  document.addEventListener('keydown', event => {
    const tag = event.target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
    if (mod && event.key.toLowerCase() === 'd') { event.preventDefault(); cloneSelection(); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection(); return; }
    if (event.key.startsWith('Arrow')) { event.preventDefault(); const step = event.shiftKey ? 10 : 1; nudge(event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0); }
  });

  $('canvaUndo').onclick = undo;
  $('canvaRedo').onclick = redo;
  $('canvaDuplicate').onclick = cloneSelection;
  $('canvaDelete').onclick = deleteSelection;
  $('canvaGroup').onclick = groupSelection;
  $('canvaUngroup').onclick = ungroupSelection;
  $('canvaAlignLeft').onclick = () => align('left');
  $('canvaAlignCenter').onclick = () => align('center');
  $('canvaAlignTop').onclick = () => align('top');
  $('figureCanvas').addEventListener('click', event => { if (event.target === canvas) select(null); });

  const oldLoadDemo = $('loadDemo')?.onclick;
  $('loadDemo')?.addEventListener('click', () => { selection.clear(); setTimeout(renderSelection, 0); });
  $('addPanel')?.addEventListener('click', () => setTimeout(renderSelection, 0));
  $('autoLayout')?.addEventListener('click', () => { saveHistory(); setTimeout(renderSelection, 0); });
  renderSelection();
})();
