const status=document.getElementById('status'),logs=document.getElementById('logBox');let activeFrame=document.getElementById('demo-frame');let downloads=[];
window.switchDemo=name=>{
    if(!['physics','cube','ui','planar2d','minecraft','doom'].includes(name))return;
    for(const url of downloads)URL.revokeObjectURL(url);downloads=[];
    document.querySelectorAll('.controls button').forEach(b=>b.classList.toggle('active',b.id==='btn-'+name));
    /* A fresh document owns each Emscripten runtime/context. Removing the old
       frame cancels its frame timers and avoids two Asyncify games sharing canvas. */
    const next=activeFrame.cloneNode(false);next.src=`./demo.html?demo=${encodeURIComponent(name)}`;activeFrame.replaceWith(next);activeFrame=next;
    document.getElementById('demo-help').textContent=({minecraft:'Click the canvas to capture the mouse. WASD move · Space jump · Shift run · Left mouse mine · Right mouse/E place · 1–8 select · C craft · Escape pause/release · F5 save · F9 load · F12 screenshot. Saves persist in this browser.',doom:'Click the canvas to capture the mouse and enable audio. WASD move · Mouse/arrows look · Left mouse/Ctrl fire · E/Space use · 1–4 weapons · Tab map · H help · Escape pause/release · R restart · F12 screenshot. Freedoom E1M1 assets included.',planar2d:'Arrow keys or left gamepad stick move · Click/tap or gamepad South jumps · Escape exits.'})[name]||'Click the canvas for input. Escape exits this demo.';
    status.textContent=`Status: Loading ${name}...`;logs.textContent=`Loading ${name}...\n`;
};
window.addEventListener('message',event=>{
    if(event.source!==activeFrame.contentWindow || event.origin!==location.origin || !event.data?.gooseDemo)return;
    const data=event.data;
    if(data.type==='running')status.textContent=`Status: Running ${data.name}`;
    else if(data.type==='exit')status.textContent=`Status: Exited (${data.code})`;
    else if(data.type==='error'){status.textContent='Status: Failed';logs.append(document.createTextNode(`[error] ${data.text}\n`));}
    else if(data.type==='log'){logs.append(document.createTextNode(`[${data.stream}] ${data.text}\n`));if(logs.textContent.length>100000)logs.textContent=logs.textContent.slice(-80000);}
    else if(data.type==='file'){const link=document.createElement('a'),url=URL.createObjectURL(new Blob([data.bytes],{type:data.filename.endsWith('.png')?'image/png':'application/octet-stream'}));downloads.push(url);link.href=url;link.download=data.filename;link.textContent=`Download ${data.filename}`;logs.append(link,document.createElement('br'));}
    logs.scrollTop=logs.scrollHeight;
});
if(location.protocol==='file:'){
    status.textContent='Start an HTTP server first';logs.textContent='From the repo directory: python -m http.server 8000\nThen open http://localhost:8000/examples/';
}else window.switchDemo('physics');
