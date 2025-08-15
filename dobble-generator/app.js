'use strict';

// ---------- Utilities ----------
function assert(condition, message) {
	if (!condition) throw new Error(message || 'Assertion failed');
}

function isPrime(n) {
	if (n < 2) return false;
	for (let i = 2; i * i <= n; i++) {
		if (n % i === 0) return false;
	}
	return true;
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function seededRandom(seed) {
	// xmur3 hash + mulberry32 PRNG
	function xmur3(str) {
		let h = 1779033703 ^ str.length;
		for (let i = 0; i < str.length; i++) {
			h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
			h = (h << 13) | (h >>> 19);
		}
		return function() {
			h = Math.imul(h ^ (h >>> 16), 2246822507);
			h = Math.imul(h ^ (h >>> 13), 3266489909);
			h ^= h >>> 16;
			return h >>> 0;
		};
	}
	function mulberry32(a) {
		return function() {
			let t = (a += 0x6D2B79F5);
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}
	const seedFunc = xmur3(String(seed || 'dobble'));
	return mulberry32(seedFunc());
}

function shuffleInPlace(array, rng) {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

// ---------- Projective plane based Dobble design (prime order n only) ----------
function coordToId(x, y, n) {
	return x * n + y; // 0..n^2-1
}

function generateDobbleDesignByPrime(n) {
	assert(isPrime(n), 'n 必須為質數（目前僅支援質數階）');
	const v = n * n + n + 1; // 符號數 = 卡牌數
	const k = n + 1; // 每張卡牌的符號數
	const cards = [];
	// 斜率 m 與截距 b 的所有有限直線：y = m x + b
	for (let m = 0; m < n; m++) {
		for (let b = 0; b < n; b++) {
			const card = [];
			for (let x = 0; x < n; x++) {
				const y = (m * x + b) % n;
				card.push(coordToId(x, y, n));
			}
			card.push(n * n + m); // 該斜率方向的無窮遠點
			cards.push(card);
		}
	}
	// 垂直線 x = a
	for (let a = 0; a < n; a++) {
		const card = [];
		for (let y = 0; y < n; y++) {
			card.push(coordToId(a, y, n));
		}
		card.push(n * n + n); // 垂直方向的無窮遠點
		cards.push(card);
	}
	// 無窮遠直線：包含所有無窮遠點
	const infCard = [];
	for (let m = 0; m <= n; m++) {
		infCard.push(n * n + m);
	}
	cards.push(infCard);
	// 驗證：卡數、每張符號數、兩兩唯一交集
	assert(cards.length === v, '卡牌數不正確');
	for (const c of cards) assert(c.length === k, '單張卡的符號數不正確');
	// 可選：進行隨機排序
	return { v, k, n, cards };
}

// ---------- Symbol asset preparation ----------
class SymbolAsset {
	constructor(kind, payload) {
		this.kind = kind; // 'image' | 'text'
		this.payload = payload; // HTMLImageElement | { text, color }
	}
}

async function loadImagesFromFiles(files) {
	const images = [];
	for (const file of files) {
		if (!file.type.startsWith('image/')) continue;
		const url = URL.createObjectURL(file);
		const img = await new Promise((resolve, reject) => {
			const el = new Image();
			el.onload = () => resolve(el);
			el.onerror = reject;
			el.src = url;
		});
		images.push(img);
	}
	return images;
}

function parseCustomTextSymbols(text) {
	if (!text) return [];
	const raw = text
		.split(/[\n,]/g)
		.map(s => s.trim())
		.filter(Boolean);
	// 去重，保留順序
	const seen = new Set();
	const result = [];
	for (const s of raw) {
		if (!seen.has(s)) { seen.add(s); result.push(s); }
	}
	return result;
}

function generateFallbackNumbers(count, startFromOne = true) {
	const arr = [];
	for (let i = 0; i < count; i++) arr.push(String(startFromOne ? i + 1 : i));
	return arr;
}

function pickPaletteColor(index) {
	// 穩定且對比的顏色表
	const palette = [
		'#ff6b6b','#f06595','#cc5de8','#845ef7','#5c7cfa','#339af0','#22b8cf','#20c997','#51cf66','#94d82d','#fcc419','#ff922b','#ff8787','#e599f7','#b197fc','#91a7ff','#74c0fc','#66d9e8','#63e6be','#8ce99a','#a9e34b','#ffe066','#ffc078'
	];
	return palette[index % palette.length];
}

function buildSymbolAssets(v, sourceMode, { images, texts }, rng) {
	const assets = [];
	if (sourceMode === 'images') {
		const imgCount = images.length;
		for (let i = 0; i < v; i++) {
			if (i < imgCount) {
				assets.push(new SymbolAsset('image', images[i]));
			} else {
				// 以數字補足，避免相同圖片造成多重匹配
				assets.push(new SymbolAsset('text', { text: String(i + 1), color: pickPaletteColor(i) }));
			}
		}
	}
	else if (sourceMode === 'text') {
		const list = texts.length ? texts : generateFallbackNumbers(v);
		for (let i = 0; i < v; i++) {
			const t = list[i] ?? String(i + 1);
			assets.push(new SymbolAsset('text', { text: t, color: pickPaletteColor(i) }));
		}
	}
	else {
		for (let i = 0; i < v; i++) {
			assets.push(new SymbolAsset('text', { text: String(i + 1), color: pickPaletteColor(i) }));
		}
	}
	return assets;
}

// ---------- Rendering ----------
function drawRoundedRectPath(ctx, x, y, w, h, r) {
	r = clamp(r, 0, Math.min(w, h) / 2);
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function renderSymbolToCanvas(asset, options) {
	const size = options.size;
	const shape = options.shape; // 'circle'|'rounded'|'square'
	const radiusRatioPercent = options.cornerRadiusPercent ?? 35;
	const imageFit = options.imageFit || 'cover';
	const bgColor = options.bgColor || 'transparent';

	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');

	// 背景（文字模式可用於提升可讀性）
	if (asset.kind === 'text' && bgColor !== 'transparent') {
		ctx.fillStyle = bgColor;
		ctx.fillRect(0, 0, size, size);
	}

	// 建立剪裁路徑
	ctx.save();
	if (shape === 'circle') {
		ctx.beginPath();
		ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
		ctx.closePath();
		ctx.clip();
	} else if (shape === 'rounded') {
		drawRoundedRectPath(ctx, 0, 0, size, size, (radiusRatioPercent / 100) * (size / 2));
		ctx.clip();
	} else {
		// square: 不剪裁或剪裁為矩形
		ctx.beginPath();
		ctx.rect(0, 0, size, size);
		ctx.clip();
	}

	// 繪製內容
	if (asset.kind === 'image') {
		const img = asset.payload;
		if (imageFit === 'cover') {
			const scale = Math.max(size / img.width, size / img.height);
			const dw = img.width * scale;
			const dh = img.height * scale;
			const dx = (size - dw) / 2;
			const dy = (size - dh) / 2;
			ctx.drawImage(img, dx, dy, dw, dh);
		} else {
			const scale = Math.min(size / img.width, size / img.height);
			const dw = img.width * scale;
			const dh = img.height * scale;
			const dx = (size - dw) / 2;
			const dy = (size - dh) / 2;
			ctx.drawImage(img, dx, dy, dw, dh);
		}
	} else if (asset.kind === 'text') {
		const { text, color } = asset.payload;
		ctx.fillStyle = '#0b1020';
		ctx.fillRect(0, 0, size, size);
		// 背景色塊
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, size, size);
		// 文字
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		// 自動縮放字體
		let fontSize = size * 0.5;
		ctx.font = `bold ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Noto Sans`;
		let metrics = ctx.measureText(text);
		const maxWidth = size * 0.8;
		const maxHeight = size * 0.7; // 估計行高
		while ((metrics.width > maxWidth || fontSize > maxHeight) && fontSize > 8) {
			fontSize -= 2;
			ctx.font = `bold ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Noto Sans`;
			metrics = ctx.measureText(text);
		}
		ctx.fillStyle = '#0b1020';
		ctx.fillText(text, size / 2, size / 2 + fontSize * 0.05);
	}
	ctx.restore();

	return canvas;
}

function drawCard(cardSymbols, symbolCanvases, options) {
	const size = options.cardSize;
	const rng = options.rng;
	const randomRotate = options.randomRotate;
	const sizeJitter = options.sizeJitter;
	const border = 8;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');

	// 卡片背景
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, size, size);
	ctx.strokeStyle = '#d0d7e2';
	ctx.lineWidth = 4;
	ctx.strokeRect(2, 2, size - 4, size - 4);

	// 佈局：將 k 個符號放在 1 或 2 個同心圓環上
	const k = cardSymbols.length;
	const centerX = size / 2;
	const centerY = size / 2;
	const radiusOuter = (size / 2) - border - 10;
	const radiusInner = radiusOuter * (k > 8 ? 0.55 : 0.0);

	const placements = [];
	if (k <= 8) {
		// 單環
		for (let i = 0; i < k; i++) {
			const angle = (i / k) * Math.PI * 2 + (rng() * 0.5);
			placements.push({
				x: centerX + Math.cos(angle) * radiusOuter * 0.65,
				y: centerY + Math.sin(angle) * radiusOuter * 0.65,
				size: size * 0.28
			});
		}
	} else {
		// 兩環：外環 floor(k*0.6)，內環其餘
		const outerCount = Math.floor(k * 0.6);
		const innerCount = k - outerCount;
		for (let i = 0; i < outerCount; i++) {
			const angle = (i / outerCount) * Math.PI * 2 + (rng() * 0.5);
			placements.push({ x: centerX + Math.cos(angle) * radiusOuter * 0.72, y: centerY + Math.sin(angle) * radiusOuter * 0.72, size: size * 0.24 });
		}
		for (let i = 0; i < innerCount; i++) {
			const angle = (i / innerCount) * Math.PI * 2 + (rng() * 0.5);
			placements.push({ x: centerX + Math.cos(angle) * radiusInner * 0.75, y: centerY + Math.sin(angle) * radiusInner * 0.75, size: size * 0.22 });
		}
	}

	// 打亂 placements 與 symbols 對應，讓圖案分布更隨機
	const shuffledIndexes = shuffleInPlace([...cardSymbols.keys()], rng);
	for (let idx = 0; idx < k; idx++) {
		const symbolId = cardSymbols[shuffledIndexes[idx]];
		const place = placements[idx];
		const baseCanvas = symbolCanvases[symbolId];
		const targetSize = place.size * (sizeJitter ? (0.9 + rng() * 0.25) : 1.0);
		const angle = randomRotate ? (rng() * Math.PI * 2) : 0;

		ctx.save();
		ctx.translate(place.x, place.y);
		ctx.rotate(angle);
		ctx.drawImage(baseCanvas, -targetSize / 2, -targetSize / 2, targetSize, targetSize);
		ctx.restore();
	}

	return canvas;
}

// ---------- Print Layout ----------
function openPrintWindow(cardCanvases, options) {
	const paper = options.paper || 'A4'; // 'A4' | 'Letter'
	const orientation = options.orientation || 'portrait';
	const cardSizeMm = options.cardSizeMm || 70;
	const gapMm = options.gapMm || 6;

	const win = window.open('', '_blank');
	if (!win) {
		alert('無法開啟列印視窗，請允許彈出視窗或改用手動另存圖片');
		return;
	}
	const doc = win.document;
	const css = `
		@page { size: ${paper} ${orientation}; margin: 8mm; }
		body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
		.sheet { display: grid; grid-template-columns: repeat(auto-fill, minmax(${cardSizeMm}mm, 1fr)); gap: ${gapMm}mm; }
		.card { width: ${cardSizeMm}mm; height: ${cardSizeMm}mm; display: flex; align-items: center; justify-content: center; border: 0.2mm solid #c8d0db; border-radius: 2mm; page-break-inside: avoid; }
		.card img { width: 100%; height: 100%; object-fit: contain; }
	`;
	const html = `
		<!doctype html>
		<html><head><meta charset="utf-8"><title>列印 Dobble</title><style>${css}</style></head>
		<body>
			<div class="sheet">
				${cardCanvases.map(c => `<div class=\"card\"><img src=\"${c.toDataURL('image/png')}\"/></div>`).join('')}
			</div>
			<script>window.onload = () => setTimeout(() => window.print(), 400);<\/script>
		</body></html>
	`;
	doc.open();
	doc.write(html);
	doc.close();
}

// ---------- DOM Wiring ----------
const dom = {
	symbolsPerCard: document.getElementById('symbolsPerCard'),
	cardsCount: document.getElementById('cardsCount'),
	cardsMaxInfo: document.getElementById('cardsMaxInfo'),
	imageFiles: document.getElementById('imageFiles'),
	imageFit: document.getElementById('imageFit'),
	customText: document.getElementById('customText'),
	imageSourcePanel: document.getElementById('imageSourcePanel'),
	textSourcePanel: document.getElementById('textSourcePanel'),
	cornerRadius: document.getElementById('cornerRadius'),
	cornerRadiusVal: document.getElementById('cornerRadiusVal'),
	cardSize: document.getElementById('cardSize'),
	cardSizeVal: document.getElementById('cardSizeVal'),
	randomRotate: document.getElementById('randomRotate'),
	sizeJitter: document.getElementById('sizeJitter'),
	seed: document.getElementById('seed'),
	generateBtn: document.getElementById('generateBtn'),
	printBtn: document.getElementById('printBtn'),
	saveSettingsBtn: document.getElementById('saveSettingsBtn'),
	previewGrid: document.getElementById('previewGrid'),
	summary: document.getElementById('summary')
};

function getSelectedSourceMode() {
	const radios = document.querySelectorAll('input[name="symbolSource"]');
	for (const r of radios) if (r.checked) return r.value;
	return 'images';
}

function getSelectedCropShape() {
	const radios = document.querySelectorAll('input[name="cropShape"]');
	for (const r of radios) if (r.checked) return r.value;
	return 'circle';
}

function updateMaxInfo() {
	const k = Number(dom.symbolsPerCard.value);
	const n = k - 1;
	const v = n * n + n + 1;
	dom.cardsMaxInfo.textContent = `最大卡數 = ${v}，最大需要符號數 = ${v}`;
	if (!isPrime(n)) dom.cardsMaxInfo.textContent += '（提示：此工具僅支援質數 n）';
	if (!dom.cardsCount.value) dom.cardsCount.value = String(v);
	else dom.cardsCount.value = String(clamp(Number(dom.cardsCount.value), 1, v));
}

dom.symbolsPerCard.addEventListener('change', () => {
	updateMaxInfo();
});

// 切換子面板
for (const r of document.querySelectorAll('input[name="symbolSource"]')) {
	r.addEventListener('change', () => {
		const mode = getSelectedSourceMode();
		dom.imageSourcePanel.classList.toggle('hidden', mode !== 'images');
		dom.textSourcePanel.classList.toggle('hidden', mode !== 'text');
	});
}

for (const r of document.querySelectorAll('input[name="cropShape"]')) {
	r.addEventListener('change', () => {
		document.getElementById('roundedOptions').classList.toggle('hidden', getSelectedCropShape() !== 'rounded');
	});
}

dom.cornerRadius.addEventListener('input', () => {
	dom.cornerRadiusVal.textContent = dom.cornerRadius.value + '%';
});

dom.cardSize.addEventListener('input', () => {
	dom.cardSizeVal.textContent = dom.cardSize.value + ' px';
});

// 儲存與載入設定
function saveSettings() {
	const data = {
		symbolsPerCard: dom.symbolsPerCard.value,
		cardsCount: dom.cardsCount.value,
		sourceMode: getSelectedSourceMode(),
		cropShape: getSelectedCropShape(),
		cornerRadius: dom.cornerRadius.value,
		cardSize: dom.cardSize.value,
		randomRotate: dom.randomRotate.checked,
		sizeJitter: dom.sizeJitter.checked,
		seed: dom.seed.value,
		imageFit: dom.imageFit.value,
		customText: dom.customText.value
	};
	localStorage.setItem('dobbleSettings', JSON.stringify(data));
	alert('設定已保存');
}

dom.saveSettingsBtn.addEventListener('click', saveSettings);

(function loadSettings() {
	try {
		const raw = localStorage.getItem('dobbleSettings');
		if (!raw) return;
		const data = JSON.parse(raw);
		if (!data) return;
		dom.symbolsPerCard.value = data.symbolsPerCard ?? dom.symbolsPerCard.value;
		dom.cardsCount.value = data.cardsCount ?? dom.cardsCount.value;
		const sourceMode = data.sourceMode ?? 'images';
		for (const r of document.querySelectorAll('input[name="symbolSource"]')) r.checked = (r.value === sourceMode);
		const cropShape = data.cropShape ?? 'circle';
		for (const r of document.querySelectorAll('input[name="cropShape"]')) r.checked = (r.value === cropShape);
		dom.cornerRadius.value = data.cornerRadius ?? dom.cornerRadius.value;
		dom.cardSize.value = data.cardSize ?? dom.cardSize.value;
		dom.randomRotate.checked = !!data.randomRotate;
		dom.sizeJitter.checked = !!data.sizeJitter;
		dom.seed.value = data.seed ?? '';
		dom.imageFit.value = data.imageFit ?? 'cover';
		dom.customText.value = data.customText ?? '';
		document.getElementById('roundedOptions').classList.toggle('hidden', getSelectedCropShape() !== 'rounded');
		dom.cornerRadiusVal.textContent = dom.cornerRadius.value + '%';
		dom.cardSizeVal.textContent = dom.cardSize.value + ' px';
	} catch (e) {
		console.warn('載入設定失敗', e);
	}
})();

updateMaxInfo();

// 主流程：產出卡片
let lastGenerated = null; // { design, cards, symbolCanvases }

dom.generateBtn.addEventListener('click', async () => {
	try {
		dom.generateBtn.disabled = true;
		dom.printBtn.disabled = true;
		dom.previewGrid.innerHTML = '';
		dom.summary.textContent = '正在生成...';

		const k = Number(dom.symbolsPerCard.value);
		const n = k - 1;
		if (!isPrime(n)) {
			alert('每張符號數需為 (n+1)，其中 n 為質數。請改為 3, 4, 6, 8, 12, 14 等選項。');
			return;
		}
		const design = generateDobbleDesignByPrime(n);
		let wantCards = clamp(Number(dom.cardsCount.value || design.v), 1, design.v);

		// 準備符號資產
		const sourceMode = getSelectedSourceMode();
		const cropShape = getSelectedCropShape();
		const cornerRadiusPercent = Number(dom.cornerRadius.value);
		const imageFit = dom.imageFit.value;
		let images = [];
		let texts = [];
		if (sourceMode === 'images') {
			const files = Array.from(dom.imageFiles.files || []);
			images = await loadImagesFromFiles(files);
		}
		if (sourceMode === 'text') {
			texts = parseCustomTextSymbols(dom.customText.value);
		}

		const seed = dom.seed.value || String(Date.now());
		const rng = seededRandom(seed);

		const assets = buildSymbolAssets(design.v, sourceMode, { images, texts }, rng);

		// 預先渲染每個符號為方形貼圖，後續再縮放排版
		const baseSymbolSize = 512;
		const symbolCanvases = assets.map((asset, i) => {
			return renderSymbolToCanvas(asset, {
				size: baseSymbolSize,
				shape: cropShape,
				cornerRadiusPercent,
				imageFit,
				bgColor: asset.kind === 'text' ? pickPaletteColor(i) : 'transparent'
			});
		});

		// 隨機打亂卡片順序，並裁切卡片數量
		const cardsOrder = shuffleInPlace([...design.cards.keys()], rng).slice(0, wantCards);
		const chosenCards = cardsOrder.map(i => design.cards[i]);

		// 渲染卡片
		const cardSize = Number(dom.cardSize.value);
		const cardCanvases = [];
		for (const cardSymbols of chosenCards) {
			const canvas = drawCard(cardSymbols, symbolCanvases, {
				cardSize,
				rng,
				randomRotate: dom.randomRotate.checked,
				sizeJitter: dom.sizeJitter.checked
			});
			cardCanvases.push(canvas);
		}

		// 預覽
		const grid = document.createElement('div');
		grid.className = 'grid';
		for (const c of cardCanvases) {
			const wrap = document.createElement('div');
			wrap.className = 'canvas-wrap';
			wrap.appendChild(c);
			dom.previewGrid.appendChild(wrap);
		}

		dom.summary.textContent = `已產生 ${cardCanvases.length} / ${design.v} 張卡；每張 ${design.k} 個符號；符號總數 ${design.v}。`;
		dom.printBtn.disabled = false;
		lastGenerated = { design, cards: chosenCards, symbolCanvases, cardCanvases, seed };
	} catch (err) {
		console.error(err);
		alert('生成失敗：' + err.message);
	} finally {
		dom.generateBtn.disabled = false;
	}
});

// 列印/輸出 PDF

dom.printBtn.addEventListener('click', () => {
	if (!lastGenerated) return;
	const paper = prompt('紙張尺寸（A4 或 Letter）', 'A4') || 'A4';
	const orientation = prompt('方向（portrait 或 landscape）', 'portrait') || 'portrait';
	const cardSizeMm = Number(prompt('卡片實體尺寸（mm）建議 70', '70')) || 70;
	const gapMm = Number(prompt('卡片間距（mm）', '6')) || 6;
	openPrintWindow(lastGenerated.cardCanvases, { paper, orientation, cardSizeMm, gapMm });
});