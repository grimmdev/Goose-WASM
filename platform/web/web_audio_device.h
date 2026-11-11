/* Browser device for the unmodified Goose PCM mixer. Included by a downstream
   patch after audio_mix(), never by the canonical upstream checkout. */
EMSCRIPTEN_KEEPALIVE void goose_web_audio_mix(float *out,int frames){
    if(audio.open && !audio.offline)audio_mix(out,frames);
    else memset(out,0,(size_t)frames*2*sizeof(float));
}
EM_JS(int,web_audio_available,(),{if(Module.gooseHost)return Module.gooseHost.state.audioAvailable?1:0;return typeof AudioContext!=='undefined'||typeof webkitAudioContext!=='undefined';});
EM_ASYNC_JS(int,web_audio_open,(int rate),{
    try{
        if(Module.gooseHost)return await Module.gooseHost.request('audio-open',{rate})?1:0;
        const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
        if(!Context)throw Error('Web Audio is unavailable');
        const ctx=new Context({sampleRate:rate}),frames=1024,ptr=_malloc(frames*2*4);
        if(!ptr){ctx.close();throw Error('PCM buffer allocation failed');}
        const device={ctx,ptr,next:0,sources:new Set(),listeners:[],timer:null};Module.gooseAudio=device;
        const pump=()=>{
            if(ctx.state!=='running')return;
            if(device.next<ctx.currentTime)device.next=ctx.currentTime;
            while(device.next<ctx.currentTime+0.08){
                Module._goose_web_audio_mix(ptr,frames);
                const buffer=ctx.createBuffer(2,frames,rate),start=ptr>>2;
                for(let channel=0;channel<2;channel++){const dest=buffer.getChannelData(channel);for(let i=0;i<frames;i++)dest[i]=HEAPF32[start+i*2+channel];}
                const source=ctx.createBufferSource();source.buffer=buffer;source.connect(ctx.destination);
                device.sources.add(source);source.onended=()=>{device.sources.delete(source);source.disconnect();};
                source.start(device.next);device.next+=frames/rate;
            }
        };
        const resume=()=>{ctx.resume().then(pump).catch(e=>err('Audio resume denied: '+e.message));};
        if(typeof document!=='undefined')for(const event of ['pointerdown','keydown']){document.addEventListener(event,resume,true);device.listeners.push(()=>document.removeEventListener(event,resume,true));}
        if(typeof window!=='undefined'){
            const dispose=()=>{const d=Module.gooseAudio;if(!d)return;delete Module.gooseAudio;clearInterval(d.timer);for(const remove of d.listeners)remove();for(const s of d.sources){try{s.stop();s.disconnect();}catch(e){}}d.ctx.close().catch(()=>{});_free(d.ptr);};
            window.addEventListener('pagehide',dispose,{once:true});device.listeners.push(()=>window.removeEventListener('pagehide',dispose));
        }
        device.timer=setInterval(pump,20);pump();return 1;
    }catch(e){err('Web Audio device failed: '+e.message);return 0;}
});
EM_JS(void,web_audio_close,(),{
    if(Module.gooseHost){Module.gooseHost.request('audio-close').catch(()=>{});return;}const device=Module.gooseAudio;if(!device)return;delete Module.gooseAudio;
    clearInterval(device.timer);for(const remove of device.listeners)remove();
    for(const source of device.sources){try{source.stop();source.disconnect();}catch(e){}}
    device.ctx.close().catch(()=>{});_free(device.ptr);
});

EM_JS(double,web_audio_ahead_frames,(),{if(Module.gooseHost)return Module.gooseHost.state.audioAhead||0;const d=Module.gooseAudio;return d?Math.max(0,d.next-d.ctx.currentTime)*d.ctx.sampleRate:0;});
