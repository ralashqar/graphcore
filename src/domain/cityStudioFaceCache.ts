/**
 * Per-thread cache of built generated-wall faces (docs/city-generated-walls-at-scale.md, "Face cache"). A face's
 * geometry (hole cutting, triangulation, wear distances, paint split, bend) is a pure function of its inputs, so it is
 * keyed by a hash of them: an edit rebuilds only the faces it changes, and a design repeated on many plots is built
 * once per worker. Entries are shared, read-only results; least recently used entries go beyond `CAPACITY` bytes.
 * Dependency-free on purpose (no geometry imports).
 */
const CAPACITY=32*1024*1024;
type Entry={value:unknown;bytes:number};
const entries=new Map<string,Entry>();
let bytes=0;
const stats={hits:0,misses:0,evictions:0,buildMs:0};

/** 53-bit string hash (cyrb53): keys stay short and deterministic. */
export function hashString(s:string,seed=0){let h1=0xdeadbeef^seed,h2=0x41c6ce57^seed;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677);}
 h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);return (4294967296*(2097151&h2)+(h1>>>0)).toString(36);}
/** Cache key of a JSON-able input: two independent hashes and the length (collisions are practically impossible). */
export const inputKey=(input:unknown)=>{const s=JSON.stringify(input);return `${hashString(s)}.${hashString(s,7)}.${s.length}`;};
/**
 * Streaming 106-bit key of numbers and strings (four 32-bit lanes, cyrb53-style mixing): numbers are hashed by their
 * float64 bits, so building a key costs no number formatting (JSON.stringify was most of a cached face's cost).
 */
export class InputHash{
 private a=0xdeadbeef;private b=0x41c6ce57;private c=0x7f4a7c15;private d=0x9e3779b9;private n=0;
 private readonly f=new Float64Array(1);private readonly u=new Uint32Array(this.f.buffer);
 private mix(v:number){this.a=Math.imul(this.a^v,2654435761);this.b=Math.imul(this.b^v,1597334677);this.c=Math.imul(this.c^v,2246822519);this.d=Math.imul(this.d^v,3266489917);this.n++;}
 num(v:number){this.f[0]=v===0?0:v;this.mix(this.u[0]);this.mix(this.u[1]);return this;}
 nums(list:ArrayLike<number>){this.mix(list.length);for(let i=0;i<list.length;i++)this.num(list[i]);return this;}
 str(s:string|undefined){if(s===undefined){this.mix(0x1e);return this;}for(let i=0;i<s.length;i++)this.mix(s.charCodeAt(i));this.mix(0x1f);return this;}
 json(v:unknown){return this.str(v===undefined?undefined:JSON.stringify(v));}
 key(){const fin=(x:number,y:number)=>{x=Math.imul(x^(x>>>16),2246822507)^Math.imul(y^(y>>>13),3266489909);y=Math.imul(y^(y>>>16),2246822507)^Math.imul(x^(x>>>13),3266489909);return (4294967296*(2097151&y)+(x>>>0)).toString(36);};
  return `${fin(this.a,this.b)}.${fin(this.c,this.d)}.${this.n}`;}
}
/** Typed-array bytes reachable from a value (arrays and plain objects, not through shared registries). */
export function typedBytes(value:unknown,seen=new Set<unknown>()):number{
 if(!value||typeof value!=='object'||seen.has(value))return 0;seen.add(value);
 if(ArrayBuffer.isView(value))return value.byteLength;
 let n=0;for(const v of Array.isArray(value)?value:Object.values(value))n+=typedBytes(v,seen);return n;
}
/** Switch for measurements (`?cityFaceCache=0` in the city): off builds every face every time. */
export const FACE_CACHE={enabled:true};
/** The cached value for `key`, or `build()` stored under it. Callers must not mutate what they get back. */
export function faceCached<T>(key:string,build:()=>T):T{
 if(!FACE_CACHE.enabled){stats.misses++;return build();}
 const hit=entries.get(key);
 if(hit){entries.delete(key);entries.set(key,hit);stats.hits++;return hit.value as T;}
 const started=performance.now(),value=build();stats.buildMs+=performance.now()-started;stats.misses++;
 const entry={value,bytes:typedBytes(value)};entries.set(key,entry);bytes+=entry.bytes;
 while(bytes>CAPACITY&&entries.size>1){const [k,e]=entries.entries().next().value!;entries.delete(k);bytes-=e.bytes;stats.evictions++;}
 return value;
}
export const faceCacheStats=()=>({...stats,buildMs:Math.round(stats.buildMs),entries:entries.size,megabytes:+(bytes/1048576).toFixed(1)});
export function resetFaceCacheStats(){stats.hits=stats.misses=stats.evictions=stats.buildMs=0;}
const clearers:(()=>void)[]=[];
/** Other per-thread memos of face inputs (cleared with the cache, e.g. for cold measurements). */
export function onFaceCacheClear(f:()=>void){clearers.push(f);}
export function clearFaceCache(){entries.clear();bytes=0;clearers.forEach(f=>f());}
