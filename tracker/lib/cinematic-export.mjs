import { FIRE_BRAND } from './fire-brand.mjs';

const DESIGN_WIDTH = 1080;
const DESIGN_HEIGHT = 1920;
const CYAN = '#7ef9ec';
const WHITE = '#effff9';
const MUTED = '#b4c9c4';
const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/** Prefer native H.264/MP4; a WebM fallback always retains its .webm extension. */
export function recordingFormat(isSupported) {
  if (typeof isSupported !== 'function') throw new TypeError('Pemeriksaan dukungan format video tidak tersedia.');
  const formats = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4', label: 'MP4' },
    { mimeType: 'video/mp4', extension: 'mp4', label: 'MP4' },
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm', label: 'WebM' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm', label: 'WebM' },
    { mimeType: 'video/webm', extension: 'webm', label: 'WebM' },
  ];
  const format = formats.find(candidate => isSupported(candidate.mimeType));
  if (!format) throw new Error('Browser ini belum mendukung perekaman MP4 atau WebM. Coba browser lain.');
  return format;
}

/**
 * Capture only the supplied application canvas. The caller owns drawing and download.
 * A cancellation rejects with AbortError and discards all collected video chunks.
 */
export function recordCanvas(canvas, { durationMs = 20000, onProgress } = {}) {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 30000) {
    throw new RangeError('Durasi rekaman harus lebih dari 0 dan paling lama 30.000 milidetik.');
  }
  if (!canvas || typeof canvas.captureStream !== 'function' || !Number.isFinite(canvas.width) || !Number.isFinite(canvas.height) || canvas.width <= 0 || canvas.height <= 0) {
    throw new TypeError('Kanvas rekaman tidak tersedia atau belum siap.');
  }
  if (onProgress !== undefined && typeof onProgress !== 'function') throw new TypeError('Callback kemajuan rekaman harus berupa fungsi.');
  const Recorder = globalThis.MediaRecorder;
  if (typeof Recorder !== 'function' || typeof Recorder.isTypeSupported !== 'function') {
    throw new Error('Browser ini belum mendukung perekaman kanvas. Coba browser lain.');
  }
  const format = recordingFormat(type => Recorder.isTypeSupported(type));
  let stream;
  let recorder;
  const stopTracks = () => {
    for (const track of stream?.getTracks?.() || []) {
      try { track.stop(); } catch { /* Continue releasing any remaining tracks. */ }
    }
  };
  try {
    stream = canvas.captureStream(30);
    if (!stream || typeof stream.getTracks !== 'function' || !stream.getTracks().length) {
      throw new Error('Aliran video kanvas tidak tersedia.');
    }
    recorder = new Recorder(stream, { mimeType: format.mimeType, videoBitsPerSecond: 6_000_000 });
  } catch (error) {
    stopTracks();
    throw new Error(`Kanvas peta tidak dapat direkam: ${error?.message || 'periksa dukungan ekspor citra peta.'}`, { cause: error });
  }

  const mimeType = recorder.mimeType || format.mimeType;
  const chunks = [];
  let settled = false;
  let stopTimer;
  let progressTimer;
  let stopWatchdog;
  let resolveRecording;
  let rejectRecording;
  const promise = new Promise((resolve, reject) => { resolveRecording = resolve; rejectRecording = reject; });
  const clearTimers = () => {
    clearTimeout(stopTimer);
    clearInterval(progressTimer);
    clearTimeout(stopWatchdog);
  };
  const cleanup = () => {
    clearTimers();
    stopTracks();
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
  };
  const reject = error => {
    if (settled) return;
    settled = true;
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* Release tracks even if the recorder failed. */ }
    chunks.length = 0;
    cleanup();
    rejectRecording(error);
  };
  const progress = value => {
    if (!onProgress || settled) return;
    try { onProgress(value); } catch (error) { reject(error); }
  };
  recorder.ondataavailable = event => {
    if (!settled && event.data?.size > 0) chunks.push(event.data);
  };
  recorder.onerror = event => reject(new Error(`Perekaman video gagal: ${event.error?.message || 'browser menghentikan perekaman.'}`, { cause: event.error }));
  recorder.onstop = () => {
    if (settled) return;
    try {
      const blob = new Blob(chunks, { type: mimeType });
      if (!blob.size) throw new Error('Video belum berisi gambar. Tunggu peta selesai dimuat, lalu rekam kembali.');
      progress(1);
      if (settled) return;
      settled = true;
      chunks.length = 0;
      cleanup();
      resolveRecording(blob);
    } catch (error) { reject(error); }
  };
  const requestStop = () => {
    if (settled) return;
    clearTimeout(stopTimer);
    clearInterval(progressTimer);
    try {
      if (recorder.state === 'inactive') throw new Error('Perekaman berhenti sebelum video selesai.');
      recorder.stop();
      stopTracks();
      if (!settled) stopWatchdog = setTimeout(() => reject(new Error('Browser tidak menyelesaikan video. Coba rekam kembali.')), 2500);
    } catch (error) { reject(error); }
  };
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  try {
    recorder.start(250);
    const startedAt = now();
    progress(0);
    if (!settled) {
      stopTimer = setTimeout(requestStop, durationMs);
      progressTimer = setInterval(() => progress(Math.min(0.999, (now() - startedAt) / durationMs)), 100);
    }
  } catch (error) { reject(new Error(`Perekaman video tidak dapat dimulai: ${error?.message || 'browser tidak merespons.'}`, { cause: error })); }
  return {
    promise,
    mimeType,
    extension: format.extension,
    cancel() {
      const error = new Error('Perekaman dibatalkan.');
      error.name = 'AbortError';
      reject(error);
    },
  };
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const safeText = (value, fallback = '') => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 240) || fallback : fallback;
const coordinate = value => Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90 ? value : null;

function font(ctx, size, weight = 500) { ctx.font = `${weight} ${size}px ${FONT}`; }
function clippedText(ctx, value, width) {
  if (ctx.measureText(value).width <= width) return value;
  let text = value;
  while (text.length && ctx.measureText(`${text}…`).width > width) text = text.slice(0, -1);
  return `${text}…`;
}
function write(ctx, value, x, y, size, color = WHITE, weight = 500, width = Infinity) {
  font(ctx, size, weight);
  ctx.fillStyle = color;
  ctx.fillText(clippedText(ctx, safeText(value), width), x, y);
}
function wrap(ctx, value, width, maxLines) {
  const words = safeText(value).split(/\s+/);
  const lines = [];
  let line = '';
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= width) { line = candidate; continue; }
    if (line) lines.push(line);
    if (lines.length === maxLines - 1) {
      line = words.slice(index).join(' ');
      break;
    }
    line = word;
  }
  if (line && lines.length < maxLines) lines.push(clippedText(ctx, line, width));
  return lines;
}
function panel(ctx, x, y, width, height, radius = 14, fill = 'rgba(3,24,23,0.88)', stroke = 'rgba(126,249,236,0.3)') {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
function reticle(ctx, x, y, size, color = CYAN) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const edge = size / 2;
  const arm = size * 0.24;
  for (const [dx, dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * (edge - arm), y + dy * edge);
    ctx.lineTo(x + dx * edge, y + dy * edge);
    ctx.lineTo(x + dx * edge, y + dy * (edge - arm));
    ctx.stroke();
  }
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y);
  ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7);
  ctx.stroke();
  ctx.restore();
}
let brandPaths;
function flame(ctx, x, y) {
  brandPaths ||= [new Path2D(FIRE_BRAND.flamePath), new Path2D(FIRE_BRAND.terrainPath)];
  ctx.save();
  ctx.translate(x, y - 25);
  ctx.scale(0.55, 0.55);
  ctx.fillStyle = FIRE_BRAND.flame;
  ctx.fill(brandPaths[0]);
  ctx.fillStyle = FIRE_BRAND.terrainDark;
  ctx.fill(brandPaths[1]);
  ctx.restore();
}
function droneIcon(ctx, x, y, heading, selected) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = selected ? 22 : 12;
  ctx.fillStyle = 'rgba(3,24,23,0.93)';
  ctx.strokeStyle = selected ? CYAN : '#d0fff7';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, selected ? 35 : 29, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.rotate((Number.isFinite(heading) ? heading : 0) * Math.PI / 180);
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-12,-12); ctx.lineTo(12,12); ctx.moveTo(12,-12); ctx.lineTo(-12,12); ctx.stroke();
  for (const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
    ctx.beginPath(); ctx.arc(dx * 13, dy * 13, 6, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = CYAN;
  ctx.beginPath(); ctx.moveTo(0,-27); ctx.lineTo(-5,-20); ctx.lineTo(5,-20); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function exactWib(value) {
  const time = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(time) || !Number.isFinite(new Date(time).getTime())) return null;
  return `${new Intl.DateTimeFormat('id-ID', { timeZone:'Asia/Jakarta', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).format(time)} WIB`;
}
function telemetryValue(value, unit, digits = 0) {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${unit}` : '—';
}

/**
 * Draw the 9:16 export composition, scaling the authored 1080×1920 layout.
 * MapLibre DOM markers are deliberately redrawn from preview-only vehicles here.
 * Public satellite clocks are independent of the illustrative flight elapsed time.
 */
export function drawShowcaseFrame(ctx, { map, fleet, elapsedMs = 0, sceneLabel = 'Bromo · Jawa Timur', detectionCount = 0, latestObservedAt = null, retrievedAt = null, chapter } = {}) {
  if (!ctx?.canvas || typeof ctx.save !== 'function' || typeof ctx.drawImage !== 'function') throw new TypeError('Konteks kanvas untuk pratinjau tidak tersedia.');
  if (!map || typeof map.getCanvas !== 'function' || typeof map.project !== 'function' || typeof map.getContainer !== 'function') throw new TypeError('Peta untuk pratinjau belum siap.');
  const source = map.getCanvas();
  const container = map.getContainer();
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  if (!source || source === ctx.canvas || !(source.width > 0 && source.height > 0) || !(width > 0 && height > 0) || !(container?.clientWidth > 0 && container?.clientHeight > 0)) throw new Error('Ukuran kanvas peta belum siap untuk pratinjau.');
  const project = coordinates => {
    if (!coordinate(coordinates)) return null;
    const point = map.project(coordinates);
    return Number.isFinite(point?.x) && Number.isFinite(point?.y) ? { x:point.x / container.clientWidth * DESIGN_WIDTH, y:point.y / container.clientHeight * DESIGN_HEIGHT } : null;
  };
  // Flag filtering happens before any coordinates or telemetry are read.
  const vehicles = (Array.isArray(fleet) ? fleet : []).filter(vehicle => vehicle?.simulated === true && vehicle?.preview === true).slice(0, 2);
  const selected = vehicles[0];
  const selectedTarget = project(selected?.sensor?.target);
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const sequenceProgress = clamp(elapsed / 20000, 0, 1);
  const copy = chapter || { kicker:'PENERBANGAN ILUSTRASI', title:'Melihat medan.\nMemahami konteks.', subtitle:'Dua UAV simulasi di atas bentang Bromo.' };

  ctx.save();
  try {
    ctx.setTransform(width / DESIGN_WIDTH, 0, 0, height / DESIGN_HEIGHT, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.setLineDash([]);
    ctx.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    const atmosphere = ctx.createLinearGradient(0, 0, 0, DESIGN_HEIGHT);
    atmosphere.addColorStop(0, 'rgba(1,16,17,0.96)');
    atmosphere.addColorStop(0.24, 'rgba(2,24,24,0.6)');
    atmosphere.addColorStop(0.42, 'rgba(2,30,27,0.08)');
    atmosphere.addColorStop(0.57, 'rgba(2,23,23,0.15)');
    atmosphere.addColorStop(0.76, 'rgba(1,18,18,0.94)');
    atmosphere.addColorStop(1, 'rgba(1,16,17,0.99)');
    ctx.fillStyle = atmosphere; ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    const vignette = ctx.createRadialGradient(540, 820, 140, 540, 820, 1040);
    vignette.addColorStop(0, 'rgba(0,10,10,0)');
    vignette.addColorStop(1, 'rgba(0,10,10,0.6)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    ctx.fillStyle = 'rgba(140,255,229,0.018)';
    for (let y = 0; y < DESIGN_HEIGHT; y += 6) ctx.fillRect(0, y, DESIGN_WIDTH, 1);

    flame(ctx, 79, 104);
    write(ctx, 'FIRE TRACKER', 139, 121, 31, WHITE, 750, 500);
    panel(ctx, 727, 80, 276, 58, 29, 'rgba(20,75,66,0.8)', 'rgba(126,249,236,0.65)');
    ctx.fillStyle = CYAN; ctx.beginPath(); ctx.arc(751, 109, 5, 0, Math.PI * 2); ctx.fill();
    write(ctx, 'SIMULASI UAV', 771, 118, 26, CYAN, 800, 215);
    write(ctx, safeText(sceneLabel, 'Bromo · Jawa Timur'), 82, 190, 30, '#d4e9e1', 550, 920);
    ctx.strokeStyle = 'rgba(126,249,236,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(82,218); ctx.lineTo(998,218); ctx.stroke();
    write(ctx, safeText(copy.kicker, 'PENERBANGAN ILUSTRASI').toUpperCase(), 82, 260, 21, CYAN, 750, 916);
    font(ctx, 67, 750);
    const titleLines = wrap(ctx, safeText(copy.title, 'Perspektif baru dari udara.'), 914, 2);
    titleLines.forEach((line, index) => write(ctx, line, 79, 339 + index * 76, 67, WHITE, 750, 920));
    font(ctx, 27, 450);
    const subtitleY = 339 + (titleLines.length - 1) * 76 + 49;
    wrap(ctx, safeText(copy.subtitle, 'Penerbangan dan area pandang adalah ilustrasi.'), 905, 2).forEach((line, index) => write(ctx, line, 82, subtitleY + index * 36, 27, MUTED, 450, 905));

    // The map canvas already contains preview trails and illustrative ground sectors.
    vehicles.forEach((vehicle, index) => {
      const point = project([vehicle.lon, vehicle.lat]);
      if (!point) return;
      const target = project(vehicle.sensor?.target);
      if (target) {
        ctx.save();
        ctx.strokeStyle = index ? 'rgba(190,255,237,0.48)' : 'rgba(126,249,236,0.8)';
        ctx.lineWidth = index ? 1.25 : 1.7;
        ctx.setLineDash([8,8]);
        ctx.beginPath(); ctx.moveTo(point.x,point.y); ctx.lineTo(target.x,target.y); ctx.stroke();
        ctx.restore();
        if (!index) reticle(ctx, target.x, target.y, 65);
      }
      if (point.x < -60 || point.x > 1140 || point.y < -60 || point.y > 1980) return;
      droneIcon(ctx, point.x, point.y, vehicle.hdg, !index);
      const labelX = index ? 748 : 100;
      const labelY = 680 + index * 125;
      ctx.strokeStyle = 'rgba(126,249,236,0.45)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(point.x, point.y + 36); ctx.lineTo(labelX + (index ? 0 : 224), labelY); ctx.stroke();
      panel(ctx, labelX, labelY - 28, 224, 60, 8, 'rgba(2,25,25,0.88)', 'rgba(126,249,236,0.3)');
      write(ctx, safeText(vehicle.id, `PREVIEW-0${index + 1}`), labelX + 13, labelY - 3, 22, WHITE, 750, 199);
      write(ctx, 'UAV DEMO', labelX + 13, labelY + 19, 15, CYAN, 650, 199);
    });

    // Crop the original map buffer around the selected simulated viewing target.
    const insetX = 100, insetY = 1145, insetWidth = 880, insetHeight = 274;
    panel(ctx, insetX, insetY, insetWidth, insetHeight, 14, 'rgba(2,24,24,0.96)', 'rgba(126,249,236,0.65)');
    const cropWidth = Math.max(1, source.width * 0.66);
    const cropHeight = Math.max(1, Math.min(source.height, cropWidth * 216 / 864));
    const focus = selectedTarget || { x:540, y:800 };
    const cropX = clamp(focus.x / DESIGN_WIDTH * source.width - cropWidth / 2, 0, Math.max(0, source.width - cropWidth));
    const cropY = clamp(focus.y / DESIGN_HEIGHT * source.height - cropHeight / 2, 0, Math.max(0, source.height - cropHeight));
    ctx.save();
    ctx.beginPath(); ctx.roundRect(insetX + 8, insetY + 50, 864, 216, 6); ctx.clip();
    ctx.drawImage(source, cropX, cropY, cropWidth, cropHeight, insetX + 8, insetY + 50, 864, 216);
    ctx.fillStyle = 'rgba(4,36,31,0.22)'; ctx.fillRect(insetX + 8, insetY + 50, 864, 216);
    ctx.restore();
    write(ctx, 'PRATINJAU MEDAN · ILUSTRASI PETA', insetX + 21, insetY + 33, 22, CYAN, 700, 835);
    const insetTargetX = insetX + 8 + (focus.x / DESIGN_WIDTH * source.width - cropX) / cropWidth * 864;
    const insetTargetY = insetY + 50 + (focus.y / DESIGN_HEIGHT * source.height - cropY) / cropHeight * 216;
    if (insetTargetX >= insetX + 25 && insetTargetX <= insetX + insetWidth - 25 && insetTargetY >= insetY + 68 && insetTargetY <= insetY + insetHeight - 18) reticle(ctx, insetTargetX, insetTargetY, 55);

    for (let index = 0; index < 2; index++) {
      const vehicle = vehicles[index];
      const x = 100 + index * 450;
      panel(ctx, x, 1438, 430, 122, 12);
      write(ctx, safeText(vehicle?.id, `PREVIEW-0${index + 1}`), x + 20, 1471, 23, WHITE, 750, 275);
      write(ctx, 'DEMO', x + 332, 1470, 18, CYAN, 800, 79);
      const columns = [[20,'ALT',telemetryValue(vehicle?.alt, ' m')],[160,'SPD',telemetryValue(vehicle?.spd, ' m/s', 1)],[306,'BAT',telemetryValue(vehicle?.bat, '%')]];
      for (const [offset,label,value] of columns) {
        write(ctx, label, x + offset, 1505, 16, MUTED, 600, 120);
        write(ctx, value, x + offset, 1540, 27, WHITE, 650, 124);
      }
    }

    panel(ctx, 100, 1580, 880, 129, 12, 'rgba(5,31,28,0.92)', 'rgba(126,249,236,0.19)');
    write(ctx, 'SUMBER SATELIT · NASA FIRMS', 121, 1610, 18, CYAN, 700, 837);
    const count = Number.isFinite(detectionCount) ? Math.max(0, Math.floor(detectionCount)) : 0;
    write(ctx, count ? `${count.toLocaleString('id-ID')} deteksi panas · area ini · 24 jam` : 'Belum ada pengamatan dalam area ini', 121, 1646, 26, WHITE, 650, 837);
    const observed = exactWib(latestObservedAt);
    write(ctx, observed ? `Pengamatan terakhir · ${observed}` : 'Pengamatan satelit bukan konfirmasi kebakaran.', 121, 1674, 20, MUTED, 450, 837);
    const retrieved = exactWib(retrievedAt);
    if (retrieved) write(ctx, `Sumber diambil · ${retrieved}`, 121, 1698, 17, MUTED, 450, 837);

    ctx.fillStyle = 'rgba(126,249,236,0.2)'; ctx.fillRect(100, 1730, 880, 3);
    ctx.fillStyle = CYAN; ctx.fillRect(100, 1730, 880 * sequenceProgress, 3);
    write(ctx, 'ghanyr.github.io/fire-tracker', 100, 1770, 29, WHITE, 650, 880);
    write(ctx, 'SIMULASI UAV · citra peta bukan siaran langsung', 100, 1810, 22, CYAN, 600, 880);
    write(ctx, 'Imagery © Esri & contributors · Terrain Mapzen/AWS', 100, 1843, 18, MUTED, 450, 880);
  } finally { ctx.restore(); }
}
