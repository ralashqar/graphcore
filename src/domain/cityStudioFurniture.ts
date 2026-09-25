import type {StudioFurnitureKind} from './cityStudioTypes.ts';

export const STUDIO_FURNITURE:Record<StudioFurnitureKind,{label:string;width:number;depth:number;height:number;color:string}>={
 table:{label:'Dining table',width:1.5,depth:.9,height:.75,color:'#9c7355'},
 chair:{label:'Chair',width:.55,depth:.55,height:.9,color:'#a37b58'},
 sofa:{label:'Sofa',width:1.9,depth:.85,height:.85,color:'#9caa8e'},
 bookcase:{label:'Bookcase',width:1.2,depth:.4,height:2,color:'#866d56'},
 plant:{label:'Indoor plant',width:.55,depth:.55,height:1.3,color:'#657c59'},
 lamp:{label:'Floor lamp',width:.42,depth:.42,height:1.6,color:'#c9b481'},
};
