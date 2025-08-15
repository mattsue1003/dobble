(function() {
	'use strict';

	// ===== Utilities =====
	function createElement(tag, attrs = {}, children = []) {
		const el = document.createElement(tag);
		Object.entries(attrs).forEach(([k, v]) => {
			if (k === 'class') el.className = v;
			else if (k === 'text') el.textContent = v;
			else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.substring(2), v);
			else el.setAttribute(k, v);
		});
		children.forEach(c => el.appendChild(c));
		return el;
	}

	function loadImageFromFile(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const img = new Image();
				img.onload = () => resolve(img);
				img.onerror = reject;
				img.src = reader.result;
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	function renderImageToShape(img, size, shape) {
		const canvas = document.createElement('canvas');
		canvas.width = size; canvas.height = size;
		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, size, size);
		if (shape === 'circle') {
			ctx.beginPath();
			ctx.arc(size/2, size/2, size/2, 0, Math.PI*2);
			ctx.closePath();
			ctx.clip();
		} else if (shape === 'rounded') {
			const r = Math.floor(size * 0.2);
			roundedRectPath(ctx, 0, 0, size, size, r);
			ctx.clip();
		}
		const { sx, sy, sSize } = coverSquare(img.width, img.height, size);
		ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, size, size);
		return canvas;
	}

	function coverSquare(imgW, imgH, target) {
		const minSide = Math.min(imgW, imgH);
		const sx = Math.floor((imgW - minSide) / 2);
		const sy = Math.floor((imgH - minSide) / 2);
		return { sx, sy, sSize: minSide };
	}

	function roundedRectPath(ctx, x, y, w, h, r) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.arcTo(x + w, y, x + w, y + h, r);
		ctx.arcTo(x + w, y + h, x, y + h, r);
		ctx.arcTo(x, y + h, x, y, r);
		ctx.arcTo(x, y, x + w, y, r);
		ctx.closePath();
	}

	function textSymbolCanvas(text, size, color, fontFamily) {
		const canvas = document.createElement('canvas');
		canvas.width = size; canvas.height = size;
		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, size, size);
		ctx.fillStyle = color || '#222';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		let fontSize = Math.floor(size * 0.5);
		ctx.font = `${fontSize}px ${fontFamily}`;
		// shrink if overflow
		while (ctx.measureText(text).width > size * 0.85 && fontSize > 10) {
			fontSize -= 2;
			ctx.font = `${fontSize}px ${fontFamily}`;
		}
		ctx.fillText(text, size/2, size/2);
		return canvas;
	}

	function toDataURL(canvas) {
		return canvas.toDataURL('image/png');
	}

	function distance(x1, y1, x2, y2) {
		const dx = x1 - x2; const dy = y1 - y2;
		return Math.sqrt(dx*dx + dy*dy);
	}

	// ===== Improved symbol placement (no overlap, inside circle) =====
	function placeSymbolsOnCard(num, cardSize) {
		const placements = [];
		const R = cardSize * 0.47; // drawable radius inside border
		const minSize = cardSize * 0.14;
		const maxSize = cardSize * 0.20;

		for (let k = 0; k < num; k++) {
			let placed = false;
			let tries = 0;
			let size = randomRange(minSize, maxSize);
			while (!placed && tries < 1200) {
				tries++;
				// Occasionally resample size to escape jams
				if (tries % 200 === 0) size = Math.max(minSize * 0.9, size * 0.9);
				const r = size / 2;
				// sample a point inside circle of radius (R - r)
				const rr = R - r;
				const theta = Math.random() * Math.PI * 2;
				const rad = Math.sqrt(Math.random()) * rr; // uniform in disk
				const cx = cardSize/2 + rad * Math.cos(theta);
				const cy = cardSize/2 + rad * Math.sin(theta);
				// check overlap with placed symbols
				let ok = true;
				for (const p of placements) {
					const need = (r + p.r) * 1.05;
					if (distance(cx, cy, p.x, p.y) < need) { ok = false; break; }
				}
				if (ok) {
					placements.push({ x: cx, y: cy, r, angle: Math.random() * Math.PI * 2, size });
					placed = true;
				}
			}
			if (!placed) {
				// fallback: shrink everything slightly and retry
				for (const p of placements) p.r *= 0.95, p.size *= 0.95;
				k--; // redo this symbol
			}
		}
		return placements;
	}

	function randomRange(a, b) { return a + Math.random() * (b - a); }

	// ===== Dobble deck generator (finite projective plane of order q, prime q) =====
	function generateDobbleDeckIndices(q) {
		const symbolCount = q*q + q + 1;
		const cards = [];
		const symbolsPerCard = q + 1;

		const pointIndex = (x, y) => x * q + y; // 0..q^2-1
		const emIndex = (m) => q*q + m; // q items
		const eIndex = () => q*q + q; // 1 item

		// Lines of slope m with intercept b: y = m x + b
		for (let m = 0; m < q; m++) {
			for (let b = 0; b < q; b++) {
				const card = [];
				for (let x = 0; x < q; x++) {
					const y = (m * x + b) % q;
					card.push(pointIndex(x, y));
				}
				card.push(emIndex(m));
				cards.push(card);
			}
		}

		// Vertical family: fixed y, plus special symbol E
		for (let y = 0; y < q; y++) {
			const card = [];
			for (let x = 0; x < q; x++) card.push(pointIndex(x, y));
			card.push(eIndex());
			cards.push(card);
		}

		// One card with all emIndex plus E
		{
			const card = [];
			for (let m = 0; m < q; m++) card.push(emIndex(m));
			card.push(eIndex());
			cards.push(card);
		}

		// Validation
		if (!cards.every(c => c.length === symbolsPerCard)) {
			console.warn('Card size mismatch', { q, cards });
		}
		if (symbolCount <= 133) {
			for (let i = 0; i < cards.length; i++) {
				for (let j = i + 1; j < cards.length; j++) {
					const inter = intersectionCount(cards[i], cards[j]);
					if (inter !== 1) console.warn('Intersection != 1', { i, j, inter });
				}
			}
		}

		return { cards, symbolCount, symbolsPerCard };
	}

	function intersectionCount(a, b) {
		let count = 0;
		const setB = new Set(b);
		for (const x of a) if (setB.has(x)) count++;
		return count;
	}

	// ===== State =====
	const state = {
		assets: [], // { id, kind: 'image'|'text', name, canvas, dataURL }
		imageShape: 'circle',
		q: 5,
		generated: null, // { deckCanvases: HTMLCanvasElement[] }
	};

	// ===== DOM =====
	const orderSelect = document.getElementById('orderSelect');
	const imageInput = document.getElementById('imageInput');
	const imageShapeSelect = document.getElementById('imageShapeSelect');
	const textInput = document.getElementById('textInput');
	const textColor = document.getElementById('textColor');
	const textFontSelect = document.getElementById('textFontSelect');
	const addTextBtn = document.getElementById('addTextBtn');
	const assetListEl = document.getElementById('assetList');
	const assetCountEl = document.getElementById('assetCount');
	const autoPadToggle = document.getElementById('autoPadToggle');
	const clearAllBtn = document.getElementById('clearAllBtn');
	const generateBtn = document.getElementById('generateBtn');
	const downloadZipBtn = document.getElementById('downloadZipBtn');
	const previewGrid = document.getElementById('previewGrid');

	orderSelect.addEventListener('change', () => {
		state.q = parseInt(orderSelect.value, 10);
		updateAssetCount();
	});

	imageShapeSelect.addEventListener('change', () => {
		state.imageShape = imageShapeSelect.value;
	});

	imageInput.addEventListener('change', async (e) => {
		const files = Array.from(e.target.files || []);
		if (!files.length) return;
		const shape = state.imageShape;
		const size = 256; // base symbol raster size
		for (const f of files) {
			try {
				const img = await loadImageFromFile(f);
				const c = renderImageToShape(img, size, shape);
				addAsset({ kind: 'image', name: f.name, canvas: c });
			} catch (err) {
				console.error('Image load failed', err);
			}
		}
		imageInput.value = '';
		updateAssetList();
	});

	addTextBtn.addEventListener('click', () => {
		const text = (textInput.value || '').trim();
		if (!text) return;
		const size = 256;
		const canvas = textSymbolCanvas(text, size, textColor.value, textFontSelect.value);
		addAsset({ kind: 'text', name: text, canvas });
		textInput.value = '';
		updateAssetList();
	});

	clearAllBtn.addEventListener('click', () => {
		state.assets = [];
		updateAssetList();
	});

	generateBtn.addEventListener('click', async () => {
		await generateDeck();
	});

	downloadZipBtn.addEventListener('click', async () => {
		if (!state.generated) return;
		await exportZip();
	});

	function addAsset({ kind, name, canvas }) {
		const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		state.assets.push({ id, kind, name, canvas, dataURL: toDataURL(canvas) });
		updateAssetCount();
	}

	function removeAsset(id) {
		state.assets = state.assets.filter(a => a.id !== id);
		updateAssetList();
	}

	function updateAssetCount() {
		const q = state.q;
		const need = q*q + q + 1;
		assetCountEl.textContent = `（目前 ${state.assets.length} / 需求 ${need}）`;
	}

	function updateAssetList() {
		assetListEl.innerHTML = '';
		for (const a of state.assets) {
			const thumb = createElement('div', { class: 'thumb' }, [
				(() => { const img = new Image(); img.src = a.dataURL; return img; })()
			]);
			const meta = createElement('div', { class: 'meta' }, [
				createElement('div', { class: 'name', text: a.name })
			]);
			const removeBtn = createElement('button', { class: 'remove', onClick: () => removeAsset(a.id) }, [
				createElement('span', { text: '移除' })
			]);
			const item = createElement('div', { class: 'asset' }, [thumb, meta, removeBtn]);
			assetListEl.appendChild(item);
		}
		updateAssetCount();
	}

	// ===== Deck generation and rendering =====
	async function generateDeck() {
		const q = state.q;
		const { cards, symbolCount, symbolsPerCard } = generateDobbleDeckIndices(q);

		// Prepare symbol atlas from assets with optional auto pad
		let symbolCanvases = state.assets.map(a => a.canvas);
		if (symbolCanvases.length < symbolCount && autoPadToggle.checked) {
			const need = symbolCount - symbolCanvases.length;
			for (let i = 0; i < need; i++) {
				const c = textSymbolCanvas(String(symbolCanvases.length + 1), 256, '#1f1f1f', 'Inter, system-ui, sans-serif');
				symbolCanvases.push(c);
			}
		}

		if (symbolCanvases.length < symbolCount) {
			alert(`符號不足。需要 ${symbolCount} 個，但目前只有 ${symbolCanvases.length} 個。`);
			return;
		}

		// Normalize to required symbol count; extras ignored
		symbolCanvases = symbolCanvases.slice(0, symbolCount);

		// Render each card to canvas
		const cardSize = 1024; // high-res for print
		const deckCanvases = [];
		previewGrid.innerHTML = '';

		for (let ci = 0; ci < cards.length; ci++) {
			const canvas = document.createElement('canvas');
			canvas.width = cardSize; canvas.height = cardSize;
			const ctx = canvas.getContext('2d');
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, cardSize, cardSize);

			// background circle card look
			ctx.save();
			ctx.translate(cardSize/2, cardSize/2);
			ctx.strokeStyle = '#e5e5e5';
			ctx.lineWidth = Math.max(4, cardSize * 0.01);
			ctx.beginPath();
			ctx.arc(0, 0, cardSize * 0.48, 0, Math.PI * 2);
			ctx.stroke();
			ctx.restore();

			// place symbols (no overlap, inside circle)
			const placements = placeSymbolsOnCard(symbolsPerCard, cardSize);
			for (let k = 0; k < cards[ci].length; k++) {
				const symIdx = cards[ci][k];
				const sym = symbolCanvases[symIdx % symbolCanvases.length];
				const p = placements[k];
				const size = p.size;
				const angle = p.angle;

				ctx.save();
				ctx.translate(p.x, p.y);
				ctx.rotate(angle);
				ctx.drawImage(sym, -size/2, -size/2, size, size);
				ctx.restore();
			}

			deckCanvases.push(canvas);

			// preview tile
			const preview = document.createElement('canvas');
			preview.width = 220; preview.height = 220;
			const pctx = preview.getContext('2d');
			pctx.drawImage(canvas, 0, 0, preview.width, preview.height);
			const cardDiv = createElement('div', { class: 'card' }, [preview]);
			previewGrid.appendChild(cardDiv);
		}

		state.generated = { deckCanvases };
		downloadZipBtn.disabled = false;
	}

	async function exportZip() {
		const zip = new JSZip();
		const folder = zip.folder('dobble');
		const canvases = state.generated.deckCanvases;
		for (let i = 0; i < canvases.length; i++) {
			const dataURL = canvases[i].toDataURL('image/png');
			const base64 = dataURL.split(',')[1];
			folder.file(`card_${String(i + 1).padStart(3, '0')}.png`, base64, { base64: true });
		}
		const content = await zip.generateAsync({ type: 'blob' });
		saveAs(content, 'dobble_cards.zip');
	}

	// Initialize
	updateAssetList();
})();