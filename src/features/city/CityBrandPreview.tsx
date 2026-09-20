import {
  Component,
  Suspense,
  useMemo,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { drawTile } from "./CityBillboards";
import { CityKit } from "./CityKit";
import {
  CITY_TIERS,
  type CityProfile,
  type CityProperty,
} from "../../domain/city";
import { BUILDING_RECIPES } from "../../domain/cityLayout";

class PreviewBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p>
        3D preview is unavailable on this device. You can still edit and save
        your branding.
      </p>
    ) : (
      this.props.children
    );
  }
}

export function CityBrandPreview({
  profile,
  tier,
  id,
}: {
  profile: CityProfile;
  tier: number;
  id?: string;
}) {
  const property = useMemo<CityProperty>(
    () => ({
      id: id || "brand-preview",
      slug: "preview",
      profile: { ...profile, name: profile.name || "Your business" },
      tier,
      rank: 1,
      x: -1,
      z: -1,
      landValue: 0,
      saves: 0,
      claims: 0,
    }),
    [profile, tier, id],
  );
  const height = BUILDING_RECIPES[tier].floors * 3;
  return (
    <section
      className="city-property-preview"
      aria-label="Live building preview"
    >
      <span className="city-eyebrow">LIVE BUILDING PREVIEW</span>
      <div className="city-brand-canvas">
        <PreviewBoundary>
          <Canvas
            key={tier}
            dpr={[1, 1.5]}
            camera={{ position: [7 + height, height * 0.8 + 6, -9], fov: 40 }}
            gl={{ antialias: true }}
          >
            <color attach="background" args={["#e8e5da"]} />
            <ambientLight intensity={1.8} />
            <directionalLight position={[20, 40, 15]} intensity={2.2} />
            <Suspense fallback={null}>
              <CityKit
                properties={[property]}
                selected={property}
                capacity={4}
                center={{ x: -1, z: -1 }}
                zoom={20}
                reduced
                labels={false}
                onSelect={() => {}}
              />
            </Suspense>
            <OrbitControls
              target={[-21, height / 2, -21]}
              enablePan={false}
              minDistance={18}
              maxDistance={95}
              maxPolarAngle={Math.PI / 2.1}
            />
          </Canvas>
        </PreviewBoundary>
      </div>
      <h2>{profile.name || "Your next address."}</h2>
      <p>{profile.tagline || "Add a logo and image to make it yours."}</p>
      <small>
        {CITY_TIERS[tier].name} · Drag to rotate. Scroll to zoom. Draft preview
        only.
      </small>
    </section>
  );
}

export function CityBillboardArtwork({ profile }: { profile: CityProfile }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    let active = true;
    const property = { profile } as CityProperty;
    drawTile(ctx, property, 0);
    const images: HTMLImageElement[] = [];
    const load = (url: string) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        if (!url) return resolve(null);
        const img = new Image();
        images.push(img);
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img.naturalWidth ? img : null);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    void Promise.all([
      load(profile.billboard || profile.hero),
      load(profile.logo),
    ]).then(([hero, logo]) => {
      if (active) drawTile(ctx, property, 0, hero, logo);
    });
    return () => {
      active = false;
      for (const img of images) {
        img.onload = null;
        img.onerror = null;
        img.src = "";
      }
    };
  }, [profile]);
  return (
    <canvas
      ref={canvas}
      width={512}
      height={256}
      className="city-billboard-artwork"
      role="img"
      aria-label="Billboard crop preview"
    />
  );
}
