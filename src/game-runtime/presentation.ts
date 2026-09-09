export type PresentationPose = { position: { x: number; y: number; z: number }; yaw: number }
/** Camera and actor share the same fixed-step interpolation, including teleport snapping. */
export function presentPose(current: PresentationPose, previous: PresentationPose | undefined, alpha: number): PresentationPose {
  if (!previous || Math.hypot(current.position.x-previous.position.x,current.position.y-previous.position.y,current.position.z-previous.position.z)>=1) return current
  const t=Math.max(0,Math.min(1,alpha)),a=previous.position,b=current.position
  return { position:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},yaw:previous.yaw+Math.atan2(Math.sin(current.yaw-previous.yaw),Math.cos(current.yaw-previous.yaw))*t }
}
