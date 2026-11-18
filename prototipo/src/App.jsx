import { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import { Edificio } from './Edificio.jsx';
import { Personas } from './Personas.jsx';
import { Entorno } from './Entorno.jsx';
import { Ui } from './Ui.jsx';
import { useStore } from './store.js';
import { AULA, H } from './model.js';
import { iniciarSimulador } from './simulator.js';

function Camara() {
  const ref = useRef();
  const sel = useStore((s) => s.seleccion);
  const vista = useStore((s) => s.vistaPiso);
  useEffect(() => {
    const c = ref.current;
    if (vista === 'todos') c.setLookAt(-52, 22, 42, -2, 4, 0, true);
    else { const y = vista * H; c.setLookAt(-8, y + 30, 30, 0, y, 0, true); }
  }, [vista]);
  useEffect(() => {
    if (!sel) return;
    const a = AULA[sel];
    ref.current.setLookAt(a.cx + 3, a.y + 9, a.cz + a.lado * 10, a.cx - 0.5, a.y + 0.6, a.cz, true);
  }, [sel]);
  return <CameraControls ref={ref} makeDefault minDistance={5} maxDistance={180} maxPolarAngle={Math.PI / 2.05} />;
}

export default function App() {
  useEffect(() => {
    const ingest = (s, d) => useStore.getState().ingest(s, d);
    // ?nats=ws://host:puerto → datos reales del bus (reutiliza la fuente NATS del visor v1)
    const url = new URLSearchParams(location.search).get('nats');
    if (url) {
      let src, cancelado = false;
      import('../../src/data/nats.js').then(({ NatsSource }) => {
        if (cancelado) return;
        src = new NatsSource({ push: ingest }, { url, subjects: 'campus.>' });
        useStore.setState({ fuente: 'nats', nats: src });
      });
      return () => { cancelado = true; src?.stop(); };
    }
    const sim = iniciarSimulador(ingest);
    useStore.setState({ fuente: 'simulador', sim });
    return () => sim.detener();
  }, []);

  return (
    <>
      <Canvas
        shadows
        camera={{ position: [-52, 22, 42], fov: 42, near: 0.3, far: 900 }}
        dpr={[1, 2]}
        onPointerMissed={() => useStore.getState().seleccionar(null)}
      >
        <fog attach="fog" args={['#cfdce8', 140, 420]} />
        <hemisphereLight args={['#e0ecff', '#6b7d55', 1.0]} />
        <directionalLight
          position={[35, 55, 28]}
          intensity={2.4}
          color="#fff3df"
          castShadow
          shadow-mapSize={[4096, 4096]}
          shadow-bias={-0.0003}
          shadow-normalBias={0.03}
          shadow-camera-left={-55}
          shadow-camera-right={45}
          shadow-camera-top={35}
          shadow-camera-bottom={-35}
          shadow-camera-near={1}
          shadow-camera-far={160}
        />
        <Entorno />
        <Edificio />
        <Personas />
        <Camara />
      </Canvas>
      <Ui />
    </>
  );
}
