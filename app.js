import { setInner, onClick } from 'https://cdn.jsdelivr.net/gh/crootjs/lib@0.0.1/element.min.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('map');
const startSelect = document.getElementById('start');
const destSelect = document.getElementById('dest');
const statusBox = document.getElementById('status');
let geojson;
let buildings = [];
let roadLines = [];
let currentRoute = null;
let bounds;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function featureName(f, i) {
  const p = f.properties || {};
  return p.label || p.Gedung || p.nama || p.name || `Bangunan ${i+1}`;
}
function getPolygons(f) {
  if (f.geometry?.type === 'Polygon') return [f.geometry.coordinates[0]];
  if (f.geometry?.type === 'MultiPolygon') return f.geometry.coordinates.map(p => p[0]);
  return [];
}
function centroid(coords) {
  const pts = coords.slice(0, -1);
  return [pts.reduce((s,p)=>s+p[0],0)/pts.length, pts.reduce((s,p)=>s+p[1],0)/pts.length];
}
function collectBounds(data) {
  const pts=[];
  for (const f of data.features || []) {
    const g=f.geometry; if(!g) continue;
    const add=(coords)=>{ if(Array.isArray(coords) && typeof coords[0]==='number') pts.push(coords); else if(Array.isArray(coords)) coords.forEach(add); };
    add(g.coordinates);
  }
  const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
  return {minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
}
function project(c) {
  const pad=42, W=900, H=700;
  const sx=(W-pad*2)/(bounds.maxX-bounds.minX), sy=(H-pad*2)/(bounds.maxY-bounds.minY), scale=Math.min(sx,sy);
  const drawnW=(bounds.maxX-bounds.minX)*scale, drawnH=(bounds.maxY-bounds.minY)*scale;
  const ox=(W-drawnW)/2, oy=(H-drawnH)/2;
  return [ox+(c[0]-bounds.minX)*scale, H-(oy+(c[1]-bounds.minY)*scale)];
}
function el(tag, attrs={}, text) {
  const node=document.createElementNS(NS,tag);
  Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));
  if(text!==undefined) node.textContent=text;
  return node;
}
function pathD(coords) { return coords.map((c,i)=>{const [x,y]=project(c);return `${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`}).join(' '); }
function drawMap() {
  svg.replaceChildren();
  svg.append(el('rect',{x:0,y:0,width:900,height:700,fill:'#f8fafc'}));
  // Latar jalan kecil berupa grid halus untuk membantu orientasi, bukan data jalan resmi.
  for(let x=0;x<=900;x+=45) svg.append(el('line',{x1:x,y1:0,x2:x,y2:700,stroke:'#edf1f5','stroke-width':1}));
  for(let y=0;y<=700;y+=45) svg.append(el('line',{x1:0,y1:y,x2:900,y2:y,stroke:'#edf1f5','stroke-width':1}));
  // Polyline jalan/l orong dari data pengguna.
  roadLines.forEach(r=>{
    svg.append(el('path',{d:pathD(r.coordinates),fill:'none',stroke:'#cbd5e1','stroke-width':11,'stroke-linecap':'round','stroke-linejoin':'round'}));
    svg.append(el('path',{d:pathD(r.coordinates),fill:'none',stroke:'#fff','stroke-width':7,'stroke-linecap':'round','stroke-linejoin':'round'}));
  });
  // Bangunan hitam dari footprint GeoJSON.
  buildings.forEach(b=>{
    b.polygons.forEach(poly=>svg.append(el('path',{d:pathD([...poly,poly[0]]),fill:'#111827',stroke:'#020617','stroke-width':1.5,opacity:.94})));
    const [x,y]=project(b.center);
    svg.append(el('text',{x,y:y+4,'text-anchor':'middle','font-size':b.name.length>17?10:12,'font-weight':'700',fill:'#fff','pointer-events':'none'},b.name));
  });
  // Titik awal/tujuan dan jalur yang sedang dipilih.
  if(currentRoute) {
    if(currentRoute.path?.length>1) svg.append(el('path',{d:pathD(currentRoute.path),fill:'none',stroke:'#0878e8','stroke-width':7,'stroke-linecap':'round','stroke-linejoin':'round'}));
    drawPin(currentRoute.start,'#16a34a','A'); drawPin(currentRoute.end,'#dc2626','B');
  }
}
function drawPin(coord,color,label) {
  const [x,y]=project(coord);
  svg.append(el('circle',{cx:x,cy:y,r:12,fill:color,stroke:'#fff','stroke-width':3}));
  svg.append(el('text',{x,y:y+4,'text-anchor':'middle','font-size':11,'font-weight':'bold',fill:'#fff'},label));
}
function distance(a,b) { const dx=(a[0]-b[0])*111320*Math.cos(a[1]*Math.PI/180),dy=(a[1]-b[1])*110540;return Math.hypot(dx,dy); }
function nearestPointOnSegment(p,a,b) {
  const latScale=110540, lonScale=111320*Math.cos(p[1]*Math.PI/180);
  const ax=(a[0]-p[0])*lonScale, ay=(a[1]-p[1])*latScale;
  const bx=(b[0]-p[0])*lonScale, by=(b[1]-p[1])*latScale;
  const dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0;
  return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
}
function snapToRoad(p) {
  let best=null,bestD=Infinity;
  roadLines.forEach(r=>{for(let i=0;i<r.coordinates.length-1;i++){
    const q=nearestPointOnSegment(p,r.coordinates[i],r.coordinates[i+1]); const d=distance(p,q);
    if(d<bestD){bestD=d;best={point:q,line:r,index:i,distance:d};}
  }});
  return best;
}
function routeBetween(a,b) {
  const sa=snapToRoad(a), sb=snapToRoad(b);
  if(!sa||!sb||!roadLines.length) return {path:[a,b],approx:true,distance:distance(a,b)};
  // Gabungkan titik-titik polyline jalan sebagai graf dan sambungkan simpul yang berdekatan.
  const nodes=[], edges=[];
  function addNode(p){nodes.push(p);edges.push([]);return nodes.length-1;}
  function addEdge(i,j){const d=distance(nodes[i],nodes[j]);edges[i].push([j,d]);edges[j].push([i,d]);}
  roadLines.forEach(r=>{let ids=r.coordinates.map(addNode);for(let i=0;i<ids.length-1;i++)addEdge(ids[i],ids[i+1]);});
  // Titik jalan yang saling dekat dianggap tersambung di persimpangan.
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)if(distance(nodes[i],nodes[j])<7)addEdge(i,j);
  function connectSnap(s){
    const ids=roadLines.indexOf(s.line); let base=0;for(let i=0;i<ids;i++)base+=roadLines[i].coordinates.length;
    const ia=base+s.index, ib=ia+1, si=addNode(s.point);
    addEdge(si,ia);addEdge(si,ib);return si;
  }
  const startNode=connectSnap(sa), endNode=connectSnap(sb);
  const dist=nodes.map(()=>Infinity), prev=nodes.map(()=>-1), used=nodes.map(()=>false);dist[startNode]=0;
  for(let k=0;k<nodes.length;k++){
    let u=-1;for(let i=0;i<nodes.length;i++)if(!used[i]&&(u<0||dist[i]<dist[u]))u=i;
    if(u<0||!Number.isFinite(dist[u]))break; if(u===endNode)break; used[u]=true;
    edges[u].forEach(([v,w])=>{if(dist[u]+w<dist[v]){dist[v]=dist[u]+w;prev[v]=u;}});
  }
  if(!Number.isFinite(dist[endNode])) return {path:[a,sa.point,sb.point,b],approx:true,distance:distance(a,sa.point)+distance(sa.point,sb.point)+distance(sb.point,b)};
  const ids=[];for(let u=endNode;u!==-1;u=prev[u])ids.push(u);ids.reverse();
  return {path:[a,sa.point,...ids.map(i=>nodes[i]),sb.point,b],approx:false,distance:distance(a,sa.point)+dist[endNode]+distance(sb.point,b)};
}
function formatDistance(m){return m>=1000?(m/1000).toFixed(2)+' km':Math.round(m)+' m';}
function showRoute() {
  const a=buildings[Number(startSelect.value)], b=buildings[Number(destSelect.value)];
  if(!a||!b)return;
  if(a===b){setInner('status','Pilih titik berangkat dan tujuan yang berbeda.');return;}
  const r=routeBetween(a.center,b.center); currentRoute={...r,start:a.center,end:b.center};drawMap();
  const note=r.approx?'Jalur masih perkiraan karena polyline jalan di data belum membentuk jaringan yang sepenuhnya tersambung.':'Rute mengikuti jaringan polyline jalan yang tersedia pada GeoJSON.';
  setInner('status',`<strong>Rute:</strong> ${esc(a.name)} → ${esc(b.name)}<br><strong>Perkiraan panjang jalur:</strong> ${formatDistance(r.distance)}<br><span>${note}</span>`);
}
function resetRoute(){currentRoute=null;drawMap();setInner('status','Pilih titik berangkat dan tujuan, lalu tekan “Tampilkan Rute”.');}
async function init(){
  try {
    const response=await fetch('./ulbi.geojson'); if(!response.ok)throw new Error('File ulbi.geojson tidak ditemukan.');
    geojson=await response.json(); bounds=collectBounds(geojson);
    const feats=geojson.features||[];
    feats.forEach((f,i)=>{
      const g=f.geometry; if(!g)return;
      if(g.type==='LineString' && g.coordinates?.length>1) roadLines.push({name:featureName(f,i),coordinates:g.coordinates});
      const polys=getPolygons(f); if(polys.length){const p=f.properties||{};const name=featureName(f,i); if(name.startsWith('Bangunan '))return;buildings.push({name,polygons:polys,center:centroid(polys[0]),properties:p});}
    });
    // Hapus nama ganda agar pilihan asal/tujuan mudah dibaca.
    const seen=new Set();buildings=buildings.filter(b=>{const key=b.name.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});
    buildings.sort((a,b)=>a.name.localeCompare(b.name,'id'));
    const options=buildings.map((b,i)=>`<option value="${i}">${esc(b.name)}</option>`).join('');
    setInner('start',options);setInner('dest',options);
    if(buildings.length>1)destSelect.value='1';
    drawMap();setInner('status',`Data dimuat: ${buildings.length} nama bangunan dan ${roadLines.length} polyline jalan/l orong. Pilih asal dan tujuan untuk menghitung rute.`);
  } catch(err){setInner('status',`Gagal memuat data: ${esc(err.message)}. Pastikan index.html, app.js, dan ulbi.geojson berada dalam folder yang sama.`);}
}
onClick('routeBtn',showRoute);
onClick('resetBtn',resetRoute);
init();
