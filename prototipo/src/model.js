// Modelo del Bloque H (de ejemplo, procedural). En la versión real esto sale del .glb de Blender:
// cada aula es un objeto llamado con su ID; asientos, puertas y escaleras son Empty.
import { Vector3 } from 'three';

export const EDIFICIO = 'H';
export const H = 3.6;          // altura de piso (m)
export const PISOS = 3;
export const BLD = { x0: -20, x1: 20, z0: -7, z1: 7 };
export const PASILLO = 1.5;    // medio ancho del pasillo central
export const NUCLEO = { x0: -20, x1: -14 }; // escalera (norte) y ascensor (sur)
export const ASCENSOR = { x: -17, z: -4.3 };
export const ENTRADA = { x: -20, z: 0 };
// Escalera en U: tramo A (sube hacia +x), descanso, tramo B (sube hacia -x). Hueco en la losa superior.
export const ESC = { zA: 2.7, zB: 4.9, xBajo: -19.2, xAlto: -16.4, xGiro: -15.7, xRell: -19.6, hx0: -19.2, hx1: -15.0, hz0: 2.0, hz1: 5.6 };
export const XS = [-14, -2.6667, 8.6667, 20];

const FILAS = 5;
const OFFS = [0.725, 1.375, 2.025]; // asientos a cada lado del pasillo central del aula

export const AULAS = [];
for (let f = 0; f < PISOS; f++) {
  let n = 1;
  for (const lado of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const x0 = XS[i], x1 = XS[i + 1];
      const z0 = lado > 0 ? PASILLO : BLD.z0;
      const z1 = lado > 0 ? BLD.z1 : -PASILLO;
      const cz = (z0 + z1) / 2;
      const codigo = `A${f + 1}0${n++}`;
      const tipo = (lado > 0 && i === 0) || (lado < 0 && i === 2) ? 'lab' : 'aula';
      // Pizarra en x0; los estudiantes miran hacia -x
      const mesas = [], asientos = [];
      for (let k = 0; k < FILAS; k++) {
        const rx = x0 + 2.9 + k * 1.4;
        for (const s of [-1, 1]) for (const o of OFFS) {
          const z = cz + s * o;
          mesas.push({ x: rx, z });
          asientos.push({ i: asientos.length, x: rx + 0.55, z, pasilloX: rx + 0.97, yaw: -Math.PI / 2 });
        }
      }
      AULAS.push({
        id: `${EDIFICIO}.P${f + 1}.${codigo}`, // = sufijo del subject NATS
        codigo, tipo, nombre: tipo === 'lab' ? 'Laboratorio de cómputo' : 'Aula',
        piso: f, lado, x0, x1, z0, z1,
        w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz, y: f * H,
        puerta: { x: (x0 + x1) / 2, z: lado * PASILLO },
        mesas, asientos, capacidad: asientos.length,
      });
    }
  }
}
export const AULA = Object.fromEntries(AULAS.map((a) => [a.id, a]));

const rnd = (a, b) => a + Math.random() * (b - a);
const V = (x, y, z) => new Vector3(x, y, z);

export function puestoDePie(a) {
  return { x: a.x1 - 1.25, z: a.cz + rnd(-1, 1) * (a.d / 2 - 0.8), yaw: -Math.PI / 2, dePie: true };
}

function subir(p, k) {
  const y0 = k * H, ym = y0 + H / 2, y1 = y0 + H;
  p.push(
    V(ESC.xRell, y0, ESC.zA), V(ESC.xBajo, y0, ESC.zA), V(ESC.xAlto, ym, ESC.zA), V(ESC.xGiro, ym, ESC.zA),
    V(ESC.xGiro, ym, ESC.zB), V(ESC.xAlto, ym, ESC.zB), V(ESC.xBajo, y1, ESC.zB), V(ESC.xRell, y1, ESC.zB), V(ESC.xRell, y1, ESC.zA),
  );
}

// Ruta: vereda de la calle → entrada principal → (escaleras) → pasillo → puerta del aula → asiento.
export function rutaHaciaAula(a, asiento) {
  const y = a.y;
  const carril = rnd(-0.6, 0.6);
  const p = [V(-42.5, 0, rnd(-12, 12)), V(-40, 0, carril), V(-21, 0, carril), V(-18.5, 0, carril)];
  if (a.piso > 0) {
    p.push(V(ESC.xRell, 0, 1.0));
    for (let k = 0; k < a.piso; k++) subir(p, k);
    p.push(V(ESC.xRell, y, 1.0), V(-17, y, carril));
  }
  const zi = a.puerta.z + a.lado * 0.3;
  p.push(V(a.puerta.x, y, carril), V(a.puerta.x, y, a.puerta.z), V(a.puerta.x, y, zi));
  if (asiento.pasilloX != null) p.push(V(asiento.pasilloX, y, zi), V(asiento.pasilloX, y, asiento.z));
  else p.push(V(asiento.x, y, zi));
  p.push(V(asiento.x, y, asiento.z));
  return p;
}

export function rutaDesdeAula(a, asiento) {
  return rutaHaciaAula(a, asiento).reverse();
}
