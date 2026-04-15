import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const EARTH_TEXTURE = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg';
const EARTH_NORMAL  = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_normal_2048.jpg';
const EARTH_SPEC    = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_specular_2048.jpg';

export default function Globe3D({ size = 300 }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 2.6;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0x333333, 1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(5, 3, 5);
    scene.add(sun);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // Earth sphere with texture
    const textureLoader = new THREE.TextureLoader();
    const geo = new THREE.SphereGeometry(1, 64, 64);

    textureLoader.load(EARTH_TEXTURE, (map) => {
      map.colorSpace = THREE.SRGBColorSpace;
      textureLoader.load(EARTH_NORMAL, (normalMap) => {
        textureLoader.load(EARTH_SPEC, (specMap) => {
          const mat = new THREE.MeshPhongMaterial({
            map,
            normalMap,
            specularMap: specMap,
            specular: new THREE.Color(0x333333),
            shininess: 20,
          });
          globeGroup.add(new THREE.Mesh(geo, mat));
        });
      });
    });

    // Clouds layer
    textureLoader.load(
      'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_clouds_1024.png',
      (cloudMap) => {
        const cloudMat = new THREE.MeshPhongMaterial({
          map: cloudMap, transparent: true, opacity: 0.35, depthWrite: false,
        });
        const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.01, 64, 64), cloudMat);
        globeGroup.add(clouds);
      }
    );


    // Interaction state
    const state = {
      isDragging: false, isHovered: false,
      prevMouse: { x: 0, y: 0 },
      rotX: 0.3, rotY: 0, velX: 0, velY: 0.003,
    };

    const onMouseEnter = () => { state.isHovered = true; };
    const onMouseLeave = () => { state.isHovered = false; state.isDragging = false; };
    const onMouseDown  = (e) => {
      state.isDragging = true;
      state.prevMouse = { x: e.clientX, y: e.clientY };
      state.velX = 0; state.velY = 0;
    };
    const onMouseMove  = (e) => {
      if (!state.isDragging) return;
      state.velY = (e.clientX - state.prevMouse.x) * 0.008;
      state.velX = (e.clientY - state.prevMouse.y) * 0.008;
      state.rotY += state.velY;
      state.rotX += state.velX;
      state.prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { state.isDragging = false; };

    el.addEventListener('mouseenter', onMouseEnter);
    el.addEventListener('mouseleave', onMouseLeave);
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (!state.isDragging) {
        state.velY += ((state.isHovered ? 0.018 : 0.003) - state.velY) * 0.05;
        state.velX *= 0.95;
        state.rotY += state.velY;
        state.rotX += state.velX;
      }
      state.rotX = Math.max(-0.7, Math.min(0.7, state.rotX));
      globeGroup.rotation.y = state.rotY;
      globeGroup.rotation.x = state.rotX;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      el.removeEventListener('mouseenter', onMouseEnter);
      el.removeEventListener('mouseleave', onMouseLeave);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [size]);

  return (
    <div
      ref={mountRef}
      style={{ width: size, height: size, cursor: 'grab' }}
      onMouseDown={() => { if (mountRef.current) mountRef.current.style.cursor = 'grabbing'; }}
      onMouseUp={() => { if (mountRef.current) mountRef.current.style.cursor = 'grab'; }}
    />
  );
}
