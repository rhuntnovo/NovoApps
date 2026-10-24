// CMS-only, loaded on demand. Nothing here is imported by the learner renderer.
let audioQueue=Promise.resolve<unknown>(undefined);
let converter:Promise<import('@ffmpeg/ffmpeg').FFmpeg>|null=null;
let idle:ReturnType<typeof setTimeout>|undefined;
async function loadConverter(){
 if(!converter)converter=(async()=>{const {FFmpeg}=await import('@ffmpeg/ffmpeg'),ffmpeg=new FFmpeg();
  try{await ffmpeg.load({coreURL:'/api/v1/cms/media-tools/ffmpeg-core.js',wasmURL:'/api/v1/cms/media-tools/ffmpeg-core.wasm'});return ffmpeg;}
  catch(error){ffmpeg.terminate();converter=null;throw error;}
 })();
 return converter;
}
export async function prepareAudio(blob:Blob,onStatus:(value:string)=>void):Promise<string>{
 const work=async()=>{
  if(blob.size>25*1024*1024)throw Error('Choose a recording under 25 MB.');
  if(idle)clearTimeout(idle);
  onStatus(converter?'Preparing Audio…':'Downloading Audio Tools (About 31 MB, Once Per Session)…');
  const ffmpeg=await loadConverter();
  try{
   onStatus('Compressing Recording To Opus…');
   await ffmpeg.writeFile('recording',new Uint8Array(await blob.arrayBuffer()));
   const result=await ffmpeg.exec(['-hide_banner','-loglevel','error','-nostdin','-i','recording','-vn','-t','600','-ac','1','-ar','48000','-c:a','libopus','-b:a','32k','-application','voip','output.opus'],180000);
   if(result!==0)throw Error('Audio conversion failed. Your original recording is still available.');
   const data=await ffmpeg.readFile('output.opus');if(typeof data==='string')throw Error('Audio output was invalid.');
   return encode(data);
  }catch(error){ffmpeg.terminate();converter=null;throw error;}
  finally{
   if(converter){await ffmpeg.deleteFile('recording').catch(()=>{});await ffmpeg.deleteFile('output.opus').catch(()=>{});
    idle=setTimeout(()=>{ffmpeg.terminate();converter=null;},5*60000);}
  }
 };
 const result=audioQueue.then(work,work);audioQueue=result.catch(()=>{});return result;
}
function encode(bytes:Uint8Array){let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);}
export async function prepareImage(blob:Blob){
 if(blob.size>20*1024*1024)throw Error('Choose an image under 20 MB.');
 const bitmap=await createImageBitmap(blob,{imageOrientation:'from-image'});
 try{
  if(bitmap.width*bitmap.height>40000000)throw Error('Choose an image under 40 megapixels.');
  async function resize(width:number){
   const canvas=document.createElement('canvas'),ratio=Math.min(1,width/bitmap.width,4096/bitmap.height);
   canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
   const context=canvas.getContext('2d');if(!context)throw Error('Image preparation is unavailable in this browser.');
   context.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const output=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Could not prepare the image.')),'image/webp',width===384?.78:.8));
   // Browsers without WebP encoding fall back to PNG, validated from bytes by the API.
   return encode(new Uint8Array(await output.arrayBuffer()));
  }
  return {data:await resize(768),smallData:await resize(384),prepared:true};
 }finally{bitmap.close();}
}
