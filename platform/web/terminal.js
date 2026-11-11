// Override only the WASI stdin read. Other descriptors retain Emscripten FS IO.
addToLibrary({
  fd_read__deps: ['$doReadv','$SYSCALLS','$Asyncify'],
  fd_read__async: true,
  fd_read: function(fd,iov,iovcnt,pnum){
    if(fd===0 && Module['gooseHost'])return Asyncify.handleAsync(async()=>{
      try{
        let bytes=Module['gooseStdinRemainder']||[];
        if(!bytes.length)bytes=await Module['gooseHost'].readStdin();
        let at=0;
        for(let i=0;i<iovcnt&&at<bytes.length;i++){
          const ptr=HEAPU32[(iov+i*8)>>2],len=HEAPU32[(iov+i*8+4)>>2],count=Math.min(len,bytes.length-at);
          HEAPU8.set(bytes.slice(at,at+count),ptr);at+=count;
        }
        Module['gooseStdinRemainder']=bytes.slice(at);HEAPU32[pnum>>2]=at;return 0;
      }catch(e){return 5;}
    });
    try{const stream=SYSCALLS.getStreamFromFD(fd),count=doReadv(stream,iov,iovcnt);HEAPU32[pnum>>2]=count;return 0;}catch(e){if(typeof FS!=='undefined'&&e instanceof FS.ErrnoError)return e.errno;throw e;}
  }
});
