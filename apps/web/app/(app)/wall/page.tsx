import { CameraWall } from "@/components/cameras/camera-wall";
import { loadCameras } from "@/lib/cameras/load";

export const revalidate = 300;

export default async function WallPage() {
  let cameras;
  try {
    cameras = await loadCameras();
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return (
      <section className="p-6">
        <h1 className="font-mono text-sm uppercase tracking-widest">Live Wall</h1>
        <p className="mt-2 font-mono text-xs text-neutral-500">
          Failed to load cameras: {message}
        </p>
      </section>
    );
  }
  return <CameraWall cameras={cameras} />;
}
