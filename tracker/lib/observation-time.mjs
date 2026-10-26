export const HOUR = 3_600_000;
export const AGE_BANDS = Object.freeze([
  Object.freeze({id:'fresh', label:'0–3 jam', color:'#ff663e'}),
  Object.freeze({id:'recent', label:'3–12 jam', color:'#dba15b'}),
  Object.freeze({id:'older', label:'>12 jam', color:'#8caaad'}),
]);

export function ageBand(observedAt, referenceTime) {
  if (!Number.isFinite(observedAt) || !Number.isFinite(referenceTime) || observedAt > referenceTime) return 'invalid';
  const elapsed = referenceTime - observedAt;
  return elapsed <= 3 * HOUR ? 'fresh' : elapsed <= 12 * HOUR ? 'recent' : 'older';
}

export function temporalRange({now, hours = 24, progress = 100, anchor = null, cutoff = null}) {
  if (!Number.isFinite(now)) throw new TypeError('Waktu acuan harus berupa milidetik yang valid');
  const windowHours = [24, 48, 168].includes(hours) ? hours : 24;
  const fixedAnchor = Number.isFinite(anchor) && anchor <= now ? anchor : now;
  const start = fixedAnchor - windowHours * HOUR;
  const position = typeof progress === 'number' && !Number.isNaN(progress) ? Math.min(100, Math.max(0, progress)) : 100;
  const requestedEnd = Number.isFinite(cutoff) ? cutoff : start + (fixedAnchor - start) * position / 100;
  const end = Math.min(fixedAnchor, Math.max(start, requestedEnd));
  return {start, end, anchor:fixedAnchor, hours:windowHours, historical:end < now - 60_000};
}

function maximumFRP(current, value) {
  return Number.isFinite(value) ? current === null ? value : Math.max(current, value) : current;
}

function groupObservations(rows, data, referenceTime) {
  const groups = new Map();
  for (const row of rows) {
    const id = `${row[7]}:${row[8]}`;
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        name:data.municipalities?.[row[8]] || data.provinces?.[row[7]] || 'Wilayah belum dipetakan',
        province:data.provinces?.[row[7]] || 'Indonesia',
        count:0, freshCount:0, latest:row[3],
        bounds:[[row[1], row[2]], [row[1], row[2]]],
        row, highConfidence:0, maxFRP:null,
      };
      groups.set(id, group);
    }
    group.count++;
    if (ageBand(row[3], referenceTime) === 'fresh') group.freshCount++;
    if (row[5] === 2) group.highConfidence++;
    if (row[3] > group.latest) { group.latest = row[3]; group.row = row; }
    group.maxFRP = maximumFRP(group.maxFRP, row[4]);
    group.bounds[0][0] = Math.min(group.bounds[0][0], row[1]);
    group.bounds[0][1] = Math.min(group.bounds[0][1], row[2]);
    group.bounds[1][0] = Math.max(group.bounds[1][0], row[1]);
    group.bounds[1][1] = Math.max(group.bounds[1][1], row[2]);
  }
  return [...groups.values()].sort((a, b) =>
    b.freshCount - a.freshCount || b.latest - a.latest || b.count - a.count || a.id.localeCompare(b.id));
}

export function summarizeSituation(rows, data, range) {
  const {start, end, anchor} = range;
  const binWidth = (anchor - start) / 24;
  const binIndex = acquiredAt => Math.min(23, Math.max(0, Math.floor((acquiredAt - start) / binWidth)));
  const bins = Array.from({length:24}, (_, index) => ({
    start:start + index * binWidth,
    end:index === 23 ? anchor : start + (index + 1) * binWidth,
    count:0,
  }));
  // Scope is supplied by the caller; snapshot metadata must never expand it.
  const windowRows = rows.filter(row => Array.isArray(row) && Number.isFinite(row[3]) && row[3] >= start && row[3] <= anchor);
  const selectedRows = [];
  const frameRows = [];
  const frameStart = Math.max(start, end - binWidth);
  const byAge = {fresh:0, recent:0, older:0};
  let latest = null;
  let highConfidence = 0;
  let maxFRP = null;
  for (const row of windowRows) {
    const index = binIndex(row[3]);
    bins[index].count++;
    if (row[3] > end) continue;
    selectedRows.push(row);
    // Narrate the interval just revealed, including the first window edge once.
    if (row[3] > frameStart || frameStart === start && row[3] === start) frameRows.push(row);
    byAge[ageBand(row[3], end)]++;
    latest = latest === null ? row[3] : Math.max(latest, row[3]);
    if (row[5] === 2) highConfidence++;
    maxFRP = maximumFRP(maxFRP, row[4]);
  }
  const frameGroups = groupObservations(frameRows, data, end).sort((a, b) =>
    b.count - a.count || b.latest - a.latest || a.id.localeCompare(b.id));
  return {
    total:selectedRows.length,
    latest:latest ?? 0,
    byAge, highConfidence, maxFRP,
    groups:groupObservations(selectedRows, data, end),
    bins,
    frame:{start:frameStart, end, count:frameRows.length, leader:frameGroups[0] || null},
  };
}

const wibFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone:'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit',
  hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23',
});

function timestamp(value) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) && Number.isFinite(new Date(parsed).getTime()) ? parsed : null;
}

function wib(value) {
  const parsed = timestamp(value);
  return parsed === null ? 'tidak tersedia' : `${wibFormatter.format(parsed)} WIB`;
}

function utc(value) {
  const parsed = timestamp(value);
  return parsed === null ? 'tidak tersedia' : new Date(parsed).toISOString();
}

function bothClocks(value) {
  return timestamp(value) === null ? 'tidak tersedia' : `${wib(value)} | UTC ${utc(value)}`;
}

export function buildSituationBrief(summary, {scope, range, retrievedAt, generatedAt, url, fieldNotes = [], contextScope = 'Indonesia'}) {
  const created = timestamp(generatedAt);
  const retrieved = timestamp(retrievedAt);
  const lines = [
    'Fire Tracker · Laporan situasi observasi satelit',
    `Cakupan: ${typeof scope === 'string' && scope.trim() ? scope.trim() : 'Cakupan tidak dicantumkan'}`,
    `Rentang pengamatan WIB: ${wib(range.start)} — ${wib(range.end)}`,
    `Rentang pengamatan UTC: ${utc(range.start)} — ${utc(range.end)}`,
    `Waktu tampilan: ${bothClocks(range.end)}${range.historical ? ' · pemutaran historis' : ''}`,
    `Jangkar jendela ${range.hours} jam: ${bothClocks(range.anchor)}`,
    `Pengamatan terbaru: ${summary.total ? bothClocks(summary.latest) : 'tidak tersedia'}`,
    `Sumber diambil: ${bothClocks(retrievedAt)}`,
    `Laporan dibuat: ${bothClocks(generatedAt)}`,
    '',
    `Ringkasan: ${summary.total} deteksi panas dalam cakupan dan rentang waktu yang dipilih.`,
    `Umur sejak akuisisi, relatif waktu tampilan: 0–3 jam: ${summary.byAge.fresh} · 3–12 jam: ${summary.byAge.recent} · >12 jam: ${summary.byAge.older}.`,
    `Kepercayaan tinggi: ${summary.highConfidence} deteksi; tingkat kepercayaan adalah atribut deteksi satelit.`,
    `FRP maksimum: ${summary.maxFRP === null ? 'tidak tersedia' : `${summary.maxFRP} MW`} (nilai maksimum per deteksi, bukan penjumlahan).`,
  ];
  if (!summary.total) {
    lines.push('Tidak ada observasi satelit dalam cakupan dan rentang waktu yang dipilih. Ini tidak membuktikan tidak ada kebakaran; jeda lintasan, awan, cakupan sensor, atau keterlambatan sumber dapat membatasi observasi.');
  } else {
    lines.push('', 'Wilayah observasi (maksimal 5, diurutkan menurut jumlah akuisisi 0–3 jam lalu akuisisi terbaru):');
    summary.groups.slice(0, 5).forEach((group, index) => {
      const location = group.name === group.province ? group.name : `${group.name}, ${group.province}`;
      lines.push(`${index + 1}. ${location}: ${group.count} deteksi, ${group.freshCount} pada 0–3 jam; akuisisi terbaru ${bothClocks(group.latest)}.`);
    });
    if (range.end - summary.latest > 3 * HOUR) {
      lines.push('Jeda observasi: pengamatan terbaru lebih dari 3 jam sebelum waktu tampilan; belum ada akuisisi lebih baru dalam cakupan ini. Jeda ini bukan bukti api sudah padam.');
    }
  }
  if (created !== null && retrieved !== null && created - retrieved > 3 * HOUR) {
    lines.push('Jeda sumber: pengambilan data lebih dari 3 jam sebelum laporan dibuat; perbarui sumber dan periksa waktu akuisisi. Ketiadaan pembaruan bukan bukti api sudah padam.');
  } else if (retrieved === null) {
    lines.push('Waktu pengambilan sumber tidak tersedia; keterkinian sumber belum dapat dinilai.');
  }
  if (Array.isArray(fieldNotes) && fieldNotes.length) {
    lines.push(
      '',
      `Catatan lapangan bertanggal · cakupan lebih luas: ${contextScope}`,
      'Catatan ini tidak harus berada di kabupaten/kota yang dipilih. Status berlaku pada tanggal laporan sumber, bukan konfirmasi kondisi kebakaran saat ini.',
    );
    fieldNotes.slice(0, 3).forEach((note, index) => {
      const location = [...new Set([note.location, note.regency, note.province].filter(Boolean))].join(', ') || 'lokasi tidak tersedia';
      lines.push(`${index + 1}. ${note.statusAsOf || note.date || 'tanggal tidak tersedia'} · ${location}. Status sumber (pada tanggal laporan): ${note.sourceStatus || 'tidak tersedia'}. Sumber: ${note.sourceName || 'tidak tersedia'}${note.sourceUrl ? ` · ${note.sourceUrl}` : ''}`);
    });
  }
  lines.push(
    '',
    'Deteksi panas bukan jumlah kejadian kebakaran, bukan waktu mulai kebakaran, dan bukan konfirmasi status aktif atau padam. Satu lokasi dapat diamati lebih dari sekali; panas juga dapat berasal dari industri atau gunung api.',
    '',
    'Langkah verifikasi:',
    '1. Periksa koordinat, sensor, dan waktu akuisisi lokasi yang akan ditinjau; cocokkan dengan catatan lapangan bertanggal serta informasi resmi terbaru.',
    '2. Lakukan verifikasi lapangan melalui petugas setempat; konfirmasikan kondisi dan akses aman kepada BPBD atau pemadam sebelum penanganan.',
    '3. Perbarui sumber dan catat waktu pemeriksaan berikutnya. Jika ada asap atau ancaman langsung, laporkan lokasi serta waktu pengamatan kepada petugas setempat.',
    '',
    `Tautan cakupan: ${typeof url === 'string' && url.trim() ? url.trim() : 'tidak tersedia'}`,
  );
  return lines.join('\n');
}
