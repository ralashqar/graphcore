import { Html } from "@react-three/drei";
import type { CityProfile } from "../../domain/city";
export function CityPavilion({
  profile,
  title,
}: {
  profile?: CityProfile;
  title?: string;
}) {
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[12, 0.4, 10]} />
        <meshLambertMaterial color="#e2d5b7" />
      </mesh>
      {[-5, 5].flatMap((x) =>
        [-4, 4].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 2.8, z]}>
            <cylinderGeometry args={[0.18, 0.18, 5.2, 8]} />
            <meshLambertMaterial color="#355b45" />
          </mesh>
        )),
      )}
      <mesh position={[0, 5.5, 0]}>
        <boxGeometry args={[13, 0.35, 11]} />
        <meshLambertMaterial color={profile?.color || "#547364"} />
      </mesh>
      <Html center position={[0, 7, 0]} zIndexRange={[3, 0]}>
        <div className="city-pavilion-label">
          <strong>{title || "DISCOVERY PAVILION"}</strong>
          <span>{profile?.name || "Creator tools · Shared exhibits"}</span>
        </div>
      </Html>
    </group>
  );
}
