import {
  AxesHelper,
  BoxGeometry,
  Color,
  GridHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function createScene(canvasHost: HTMLElement) {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true });
  } catch (error) {
    return { ok: false as const, reason: `3D を描けません: ${String(error)}` };
  }
  canvasHost.append(renderer.domElement);
  const scene = new Scene();
  scene.background = new Color(0x17212a);
  const camera = new PerspectiveCamera(50, 1, 0.05, 10000);
  camera.up.set(0, 0, 1);
  camera.position.set(12, -12, 12);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.update();
  const grid = new GridHelper(100, 100);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);
  const robot = new Group();
  const robotGeometry = new BoxGeometry(0.8, 0.5, 0.3);
  const robotMaterial = new MeshBasicMaterial({ color: 0xffaa33, wireframe: true });
  const axes = new AxesHelper(1);
  robot.add(axes, new Mesh(robotGeometry, robotMaterial));
  scene.add(robot);
  const overlayGroup = new Group();
  scene.add(overlayGroup);
  function startRendering(): () => void {
    let animation = 0;
    const draw = () => {
      const width = canvasHost.clientWidth || 1;
      const height = canvasHost.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      controls.update();
      renderer.render(scene, camera);
      animation = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(animation);
    };
  }
  function dispose(): void {
    controls.dispose();
    renderer.dispose();
    robotGeometry.dispose();
    robotMaterial.dispose();
    axes.dispose();
    grid.dispose();
  }
  return {
    ok: true as const,
    scene,
    camera,
    renderer,
    controls,
    robot,
    overlayGroup,
    startRendering,
    dispose,
  };
}
