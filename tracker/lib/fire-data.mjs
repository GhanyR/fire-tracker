export const SOURCE_FEEDS = [
 {id:'VIIRS_SNPP_NRT',name:'VIIRS S-NPP',url:'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_SouthEast_Asia_24h.csv'},
 {id:'VIIRS_NOAA20_NRT',name:'VIIRS NOAA-20',url:'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_SouthEast_Asia_24h.csv'},
 {id:'VIIRS_NOAA21_NRT',name:'VIIRS NOAA-21',url:'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_SouthEast_Asia_24h.csv'},
 {id:'MODIS_NRT',name:'MODIS Terra/Aqua',url:'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_SouthEast_Asia_24h.csv'}
];
export function validCoordinates(c){return Array.isArray(c)&&c.length>=2&&c.every(x=>x!==null&&x!==''&&Number.isFinite(Number(x)))&&Number(c[0])>=94&&Number(c[0])<=142&&Number(c[1])>=-12&&Number(c[1])<=7;}
export function pointInGeometry(point,geometry){
 const ringContains=ring=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(((a[1]>point[1])!==(b[1]>point[1]))&&(point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]))inside=!inside;}return inside;};
 const polygonContains=p=>ringContains(p[0])&&!p.slice(1).some(ringContains);
 return geometry.type==='Polygon'?polygonContains(geometry.coordinates):geometry.type==='MultiPolygon'?geometry.coordinates.some(polygonContains):false;
}
export function parseFirmsCSV(text,sensor){
 const lines=text.trim().split(/\r?\n/),headers=lines.shift()?.split(',')||[];
 if(!headers.includes('latitude')||!headers.includes('acq_date'))throw new Error('Format FIRMS tidak dikenali');
 const pos=Object.fromEntries(headers.map((x,i)=>[x,i]));const rows=[];
 for(const line of lines){const v=line.split(',');if(['latitude','longitude','acq_time','confidence'].some(k=>!v[pos[k]]?.trim()))continue;const lat=Number(v[pos.latitude]),lon=Number(v[pos.longitude]);if(!validCoordinates([lon,lat]))continue;
 const rawTime=(v[pos.acq_time]||'').padStart(4,'0');if(!/^\d{4}$/.test(rawTime)||Number(rawTime.slice(0,2))>23||Number(rawTime.slice(2))>59)continue;
 const observed=Date.parse(`${v[pos.acq_date]}T${rawTime.slice(0,2)}:${rawTime.slice(2)}:00Z`);if(!Number.isFinite(observed))continue;
 const c=(v[pos.confidence]||'').toLowerCase();const confidence=c==='h'||c==='high'?2:c==='n'||c==='nominal'?1:c==='l'||c==='low'?0:Number.isFinite(Number(c))&&c!==''?(Number(c)>=80?2:Number(c)>=30?1:0):0;
 const frp=v[pos.frp]!==''&&v[pos.frp]!==undefined&&Number.isFinite(Number(v[pos.frp]))?Number(v[pos.frp]):null;
 rows.push([`${sensor}:${lon}:${lat}:${observed}`,lon,lat,observed,frp,confidence,sensor,-1,-1]);}
 return rows;
}
export function filterRows(rows,{now=Date.now(),hours=24,confidence=0,sensor=-1,province=-1,municipality=-1,query='',provinces=[],municipalities=[],until=now}={}){
 const since=now-hours*3600000,q=query.trim().toLocaleLowerCase('id');
 return rows.filter(r=>r[3]>=since&&r[3]<=Math.min(now,until)&&r[5]>=confidence&&(sensor<0||r[6]===sensor)&&(province<0||r[7]===province)&&(municipality<0||r[8]===municipality)&&(!q||`${provinces[r[7]]||''} ${municipalities[r[8]]||''} ${r[1]} ${r[2]}`.toLocaleLowerCase('id').includes(q)));
}
export function mergeRows(oldRows,newRows){
 const key=r=>`${r[6]}:${r[1]}:${r[2]}:${r[3]}`;const merged=new Map(oldRows.map(r=>[key(r),r]));for(const r of newRows){const k=key(r),old=merged.get(k);merged.set(k,old?[old[0],r[1],r[2],r[3],r[4],r[5],r[6],r[7]>=0?r[7]:old[7],r[8]>=0?r[8]:old[8]]:r);}return [...merged.values()];
}
export function normalizeCitizen(feature){
 const p=feature?.properties;if(!p||p.is_training===true||!validCoordinates(feature.geometry?.coordinates))return null;
 return {id:`petabencana-${p.pkey}`,kind:'community-report',disaster:p.disaster_type,reportedAt:p.created_at,location:p.tags?.city||'Lokasi laporan',coordinates:feature.geometry.coordinates.map(Number),text:p.text||p.title||'',platformStatus:p.status,officialVerification:false,sourceName:'PetaBencana',sourceUrl:'https://petabencana.id/',caveat:'Laporan warga; belum diverifikasi petugas di aplikasi ini.'};
}
export function toCSV(rows){return '\uFEFF'+rows.map(row=>row.map(value=>{let s=value===null||value===undefined?'':String(value);if(typeof value!=='number'&&/^[=+@\-\t\r]/.test(s))s="'"+s;return /[",\n\r]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}).join(',')).join('\r\n');}
export function distanceKm(a,b){const rad=x=>x*Math.PI/180;const dlat=rad(b[1]-a[1]),dlon=rad(b[0]-a[0]);const q=Math.sin(dlat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dlon/2)**2;return 6371*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));}
export function nearestFacilities(coordinates,facilities,limit=5){if(!validCoordinates(coordinates))return [];return facilities.filter(f=>validCoordinates(f.coordinates)).map(f=>({...f,distanceKm:distanceKm(coordinates,f.coordinates)})).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,limit);}
export function localDate(now=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function numeric(v){if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null;}
export function stableId(value){let a=2166136261,b=5381;for(const c of String(value)){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b,33)^c.charCodeAt(0);}return (a>>>0).toString(16)+(b>>>0).toString(16);}
export function normalizeSuppression(feature,from,to){const p=feature.properties||{};const date=p.tanggal?.slice(0,10);if(!date||date<from||date>to)return null;return {id:`sipongi-${p.id||p.gid||stableId(JSON.stringify([date,feature.geometry?.coordinates,p.lokasi,p.catatan,p.nama_daops,p.luas_bakar,p.luas_padam]))}`,kind:'official-operation-report',title:'Pemadaman karhutla',date,statusAsOf:date,coordinates:validCoordinates(feature.geometry?.coordinates)?feature.geometry.coordinates.map(Number):null,sourceStatus:p.catatan||'Kegiatan pemadaman dilaporkan',province:p.provinsi||'',regency:p.kabupaten||p.kabkota||'',location:p.lokasi||p.desa||p.nama_daops||p.daops||'',description:p.catatan||p.keterangan||'',areaBurnedHa:numeric(p.luas_bakar),areaExtinguishedHa:numeric(p.luas_padam),sourceName:'SiPongi · Kementerian Kehutanan',sourceUrl:'https://sipongi.gakkum.kehutanan.go.id/peta',caveat:'Catatan kegiatan, bukan konfirmasi status api saat ini.'};}
export function normalizeKobar(p,from,to){const date=p.tanggal?.slice(0,10);if(!date||date<from||date>to)return null;return {id:`kobar-operation-${p.id}`,kind:'official-operation-report',title:p.nama_kejadian||p.jenis_kejadian||'Penanganan karhutla',date,statusAsOf:date,reportedTimeOriginal:p.waktu_kejadian,province:'Kalimantan Tengah',regency:'Kotawaringin Barat',district:p.kecamatan,village:p.desa_kelurahan,location:p.lokasi,coordinates:validCoordinates([p.lng,p.lat])?[Number(p.lng),Number(p.lat)]:null,sourceStatus:p.kondisi_mutakhir||'Belum ada pembaruan',description:p.upaya_penanganan,personnel:p.personil,equipment:p.peralatan,areaBurnedHa:numeric(p.lahan_ha),areaExtinguishedHa:numeric(p.lahan_dipadamkan),sourceName:'BPBD Kotawaringin Barat',sourceUrl:`https://bpbd.kotawaringinbaratkab.go.id/website/infografis_karhutla.php?start_date=${from}&end_date=${to}`,caveat:'Status pada waktu laporan; satu kejadian dapat memiliki beberapa catatan.'};}
export function extractAssignedJSON(html,name){const m=html.match(new RegExp('(?:window\\.)?'+name+'\\s*=\\s*'));if(!m)throw new Error('Data '+name+' tidak ditemukan');const rest=html.slice(m.index+m[0].length);let depth=0,inString=false,escape=false;for(let i=0;i<rest.length;i++){let c=rest[i];if(inString){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')inString=false;}else if(c==='"')inString=true;else if(c==='['||c==='{')depth++;else if(c===']'||c==='}'){depth--;if(depth===0)return JSON.parse(rest.slice(0,i+1));}}throw new Error('Data sumber tidak lengkap');}
export function resolveShared(params,data,context,bmkg){
 const id=params.get('id'),coordinates=[Number(params.get('lon')),Number(params.get('lat'))];let item=null;
 if(id){item=['operations','communityReports','facilities','airQuality'].flatMap(k=>context?.[k]||[]).find(x=>x.id===id)||null;const row=data?.rows.find(r=>r[0]===id||(params.get('kind')==='satellite'&&r[1]===coordinates[0]&&r[2]===coordinates[1]&&String(r[3])===params.get('time')&&String(r[6])===params.get('sensor')));if(row)item={kind:'satellite',row,coordinates:[row[1],row[2]],id:row[0]};if(params.get('kind')==='bmkg'){const b=bmkg?.rows.find(r=>r.longitude===coordinates[0]&&r.latitude===coordinates[1]);if(b)item={...b,kind:'bmkg',coordinates,id};}}
 const center=validCoordinates(item?.coordinates)?item.coordinates:params.has('lon')&&params.has('lat')&&validCoordinates(coordinates)?coordinates:null;
 return {item,camera:center?{center,zoom:Math.min(14,Math.max(4,Number(params.get('zoom'))||10))}:null};
}

export const dedupeRecords=rows=>[...new Map(rows.map(r=>[r.id,r])).values()];
export function parseBMKG(text){const lines=text.trim().split(/\r?\n/);if(!lines.shift()?.startsWith("Longitude\tLatitude"))throw new Error("Format BMKG tidak dikenali");return lines.map(line=>{const v=line.split("\t");if(!v[0]||!v[1]||!validCoordinates([v[0],v[1]]))return null;return {longitude:Number(v[0]),latitude:Number(v[1]),date_raw:v[2],time_raw:v[3],satellite_raw:v[4],province_raw:v[6],municipality:v[7],subdistrict:v[8],timezone:"undocumented in raw feed",source:"BMKG_GEOHOTSPOT",source_url:"https://inderaja.bmkg.go.id/IMAGE/GEOHOTSPOT/H08_GH_Indonesia.txt"};}).filter(Boolean);}
