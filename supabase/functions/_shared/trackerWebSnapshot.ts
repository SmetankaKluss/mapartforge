const integer = (n: unknown, min: number, max: number): n is number => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
export function validTrackerWebSnapshot(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  if (Object.keys(s).some(key => !['width','height','palette','pixels','summary','parts','materials'].includes(key))) return false;
  if (!integer(s.width,1,1280) || !integer(s.height,1,1280) || !Array.isArray(s.palette) || s.palette.length<1 || s.palette.length>1024
    || s.palette.some(c=>!integer(c,-2147483648,2147483647)) || typeof s.pixels!=='string') return false;
  const length=s.width*s.height*2;
  if(s.pixels.length!==4*Math.ceil(length/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(s.pixels))return false;
  try { const bytes=atob(s.pixels); if(bytes.length!==length||btoa(bytes)!==s.pixels)return false;
    for(let i=0;i<bytes.length;i+=2)if((bytes.charCodeAt(i)|(bytes.charCodeAt(i+1)<<8))>=s.palette.length)return false;
  } catch { return false; }
  const summary=(v:unknown)=>Array.isArray(v)&&v.length===6&&v.every(n=>integer(n,0,32000000))&&v.slice(1).reduce((a,b)=>a+b,0)===v[0];
  if(!summary(s.summary)||!Array.isArray(s.parts)||s.parts.length>100||s.parts.some(v=>v!==null&&!summary(v)))return false;
  if(!s.materials||typeof s.materials!=='object'||Array.isArray(s.materials)||Object.keys(s.materials).length>512)return false;
  return Object.entries(s.materials).every(([name,count])=>/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(name)&&name.length<=128&&integer(count,0,32000000));
}
