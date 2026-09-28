// Kit pieces with surface finishes (docs/city-surfaces.md): the texture/render key and the instance colour of a
// piece channel. Surface keys carry their tint, so their instance colour is white (colours multiply in the shader).
import {STUDIO_FAMILIES} from './cityStudioCatalog.ts';
import {finishRenderTexture,validSurfaceSpec} from './cityStudioSurfaces.ts';
import type {StudioChannel,StudioFamily,StudioFinish} from './cityStudioTypes.ts';

const familyColor=(family:StudioFamily,channel:string)=>{const palette=STUDIO_FAMILIES[family];return palette[channel as keyof typeof palette]??palette.trim;};
export function pieceTexture(p:{family:StudioFamily;finishes?:Partial<Record<StudioChannel,StudioFinish>>},channel:string):string|undefined{
 return finishRenderTexture(p.finishes?.[channel as StudioChannel],familyColor(p.family,channel));
}
export function pieceTint(p:{family:StudioFamily;finishes?:Partial<Record<StudioChannel,StudioFinish>>},channel:string):string{
 const f=p.finishes?.[channel as StudioChannel];return f?.surface&&validSurfaceSpec(f.surface)?'#ffffff':f?.color??familyColor(p.family,channel);
}
