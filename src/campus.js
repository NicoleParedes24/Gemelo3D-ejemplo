import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Boxes, boxUV, mesh, terrainH, fbm, smooth, mulberry32, distToPolyline } from './util.js';
import { M, pickGlass } from './materials.js';
import { glowTex, textTex, muralTex } from './textures.js';
import { TURBINES, WIND_ROUTES, PYLONS } from './layout.js';

const rnd = mulberry32(9001);
const R = (a, b) => a + (b - a) * rnd();

// ------------------------------------------------------------------
// Bloque genérico con fachada modulada (ventanas instanciadas)
// ------------------------------------------------------------------
function block(B, g, o) {
  const { cx, cz, w, d, floors, fh, style, holes = [] } = o;
  const H = floors * fh;
  g.add(mesh(boxUV(w, H, d, 3), o.wallMat, cx, H / 2, cz));

  const sides = [
    [cx - w / 2, cz + d / 2, 1, 0, 0, 1, w],
    [cx - w / 2, cz - d / 2, 1, 0, 0, -1, w],
    [cx + w / 2, cz - d / 2, 0, 1, 1, 0, d],
    [cx - w / 2, cz - d / 2, 0, 1, -1, 0, d],
  ];
  for (const [ox, oz, tx, tz, nx, nz, len] of sides) {
    const n = Math.round(len / o.bay), bw = len / n;
    for (let i = 0; i < n; i++) {
      const px = ox + tx * (i + 0.5) * bw, pz = oz + tz * (i + 0.5) * bw;
      for (let f = 0; f < floors; f++) {
        const sill = f === 0 ? o.sill0 ?? o.sill : o.sill;
        const wh = f === 0 ? o.winH0 ?? o.winH : o.winH;
        const y = f * fh + sill + wh / 2;
        const tx2 = px + nx * 0.4, tz2 = pz + nz * 0.4;
        if (holes.some((h) => tx2 > h.x0 && tx2 < h.x1 && tz2 > h.z0 && tz2 < h.z1 && y < h.y)) continue;
        const ww = bw - o.pier;
        // Hueco oscuro y marco profundo alrededor del vidrio: da relieve a las
        // fachadas cuando la luz rasante proyecta sombras sobre las ventanas.
        B.add(M.darkMetal, px + nx * 0.035, y, pz + nz * 0.035,
          tx ? ww + 0.18 : 0.18, wh + 0.18, tz ? ww + 0.18 : 0.18);
        B.add(pickGlass(rnd()), px + nx * 0.14, y, pz + nz * 0.14,
          tx ? Math.max(0.2, ww - 0.12) : 0.055, Math.max(0.2, wh - 0.12),
          tz ? Math.max(0.2, ww - 0.12) : 0.055);
        B.add(M.white, px + nx * 0.17, y - wh / 2 - 0.08, pz + nz * 0.17,
          tx ? ww + 0.24 : 0.26, 0.12, tz ? ww + 0.24 : 0.26);
        if (style === 'brick') {
          B.add(M.white, px + nx * 0.02, y, pz + nz * 0.02, tx ? ww + 0.36 : 0.1, wh + 0.36, tz ? ww + 0.36 : 0.1);
          // parteluz central
          B.add(M.darkMetal, px + nx * 0.08, y, pz + nz * 0.08, tx ? 0.07 : 0.1, wh, tz ? 0.07 : 0.1);
        }
      }
    }
    if (style === 'frame') {
      for (let i = 0; i <= n; i++) {
        const fx = ox + tx * i * bw + nx * 0.17, fz = oz + tz * i * bw + nz * 0.17;
        B.add(M.white, fx, H / 2, fz, tx ? 0.32 : 0.35, H, tz ? 0.32 : 0.35);
      }
    }
  }
  if (style === 'frame') {
    for (let f = 1; f <= floors; f++) B.add(M.white, cx, f * fh, cz, w + 0.7, 0.5, d + 0.7);
  } else {
    B.add(M.white, cx, H + 0.05, cz, w + 0.5, 0.4, d + 0.5);
    B.add(M.white, cx, fh, cz, w + 0.16, 0.18, d + 0.16);
  }
  B.add(M.darkConcrete, cx, 0.2, cz, w + 0.3, 0.4, d + 0.3);
  // antepecho y cubierta
  const py = H + 0.6;
  B.add(M.white, cx, py, cz + d / 2 - 0.2, w, 1.0, 0.4);
  B.add(M.white, cx, py, cz - d / 2 + 0.2, w, 1.0, 0.4);
  B.add(M.white, cx + w / 2 - 0.2, py, cz, 0.4, 1.0, d);
  B.add(M.white, cx - w / 2 + 0.2, py, cz, 0.4, 1.0, d);
  g.add(mesh(boxUV(w - 0.8, 0.1, d - 0.8, 3), M.roof, cx, H + 0.3, cz, { cast: false }));
}

function gabledRoof(parent, cx, cz, w, d, eaveY, ridgeY, material = M.metalRoof) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const zm = cz;
  const positions = [
    x0,eaveY,z0,  x1,eaveY,z0,  x0,ridgeY,zm,  x1,ridgeY,zm,
    x0,eaveY,z1,  x1,eaveY,z1,  x0,ridgeY,zm,  x1,ridgeY,zm,
  ];
  const uv = [0,0, 1,0, 0,1, 1,1, 0,0, 1,0, 0,1, 1,1];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex([0,2,1, 1,2,3, 4,5,6, 5,7,6]);
  geo.computeVertexNormals();
  const roof = mesh(geo, material, 0, 0, 0);
  roof.material.side = THREE.DoubleSide;
  parent.add(roof);
  // Cierra los testeros triangulares para que no se vea el interior bajo la chapa.
  for (const x of [x0, x1]) {
    const end = new THREE.BufferGeometry();
    end.setAttribute('position', new THREE.Float32BufferAttribute([
      x,eaveY,z0, x,eaveY,z1, x,ridgeY,zm,
    ], 3));
    end.setIndex([0,1,2]); end.computeVertexNormals();
    const face = mesh(end, M.darkConcrete, 0, 0, 0);
    face.material.side = THREE.DoubleSide;
    parent.add(face);
  }
  return roof;
}

// Reconstrucción aproximada del Bloque H a partir de las fotografías:
// edificio bajo de piedra, alas laterales, cubierta roja de chapa y acceso cubierto.
function buildBlockH(parent) {
  const shell = new THREE.Group();
  shell.name = 'bloque-h-exterior';
  parent.add(shell);
  const interior = new THREE.Group();
  interior.name = 'bloque-h-interior';
  interior.visible = true;
  parent.add(interior);
  const B = new Boxes();
  const roof = new THREE.Group();
  roof.name = 'bloque-h-cubierta';
  shell.add(roof);
  const roofB = new Boxes();
  const cx = 30, cz = 10;
  const lights = [];
  const fountainJets = [], fountainDrops = [];
  const redRoof = new THREE.MeshStandardMaterial({ color:0xa64e49, roughness:0.63, metalness:0.22 });
  // Vidrio exterior ligeramente tintado, pero suficientemente claro para leer
  // las aulas y el laboratorio desde el patio.
  // Pane casi incoloro: los reflejos del material físico anterior hacían que
  // el vidrio pareciera una lámina gris y ocultara las aulas desde el exterior.
  const windowGlass = new THREE.MeshBasicMaterial({ color:0xdff7ff, transparent:true, opacity:0.045, side:THREE.DoubleSide, depthWrite:false });
  const wallBox=(mat,x,y,z,w,h,d)=>shell.add(mesh(boxUV(w,h,d,4),mat,x,y,z));
  const frontWallWithWindows=(mat,x0,x1,z,windows,depth=0.38,wallHeight=4.25,upperWindows=[])=>{
    const sill=1.55, head=3.55, mid=(x0+x1)/2;
    wallBox(mat,mid,sill/2,z,x1-x0,sill,depth);
    if(upperWindows.length) {
      const upperSill=4.08, upperHead=5.62;
      wallBox(mat,mid,(head+upperSill)/2,z,x1-x0,upperSill-head,depth);
      wallBox(mat,mid,(upperHead+wallHeight)/2,z,x1-x0,wallHeight-upperHead,depth);
      let upperEdge=x0;
      for(const [ux,uw] of upperWindows.slice().sort((a,b)=>a[0]-b[0])) {
        const left=ux-uw/2;
        if(left>upperEdge) wallBox(mat,(upperEdge+left)/2,(upperSill+upperHead)/2,z,left-upperEdge,upperHead-upperSill,depth);
        upperEdge=ux+uw/2;
      }
      if(upperEdge<x1) wallBox(mat,(upperEdge+x1)/2,(upperSill+upperHead)/2,z,x1-upperEdge,upperHead-upperSill,depth);
    } else wallBox(mat,mid,(head+wallHeight)/2,z,x1-x0,wallHeight-head,depth);
    let edge=x0;
    for(const [x,w] of windows.slice().sort((a,b)=>a[0]-b[0])) {
      const left=x-w/2;
      if(left>edge) wallBox(mat,(edge+left)/2,(sill+head)/2,z,left-edge,head-sill,depth);
      edge=x+w/2;
    }
    if(edge<x1) wallBox(mat,(edge+x1)/2,(sill+head)/2,z,x1-edge,head-sill,depth);
  };
  const sideWallWithWindows=(mat,x,z0,z1,centers,wallHeight=4.25,upperCenters=[])=>{
    const sill=1.51, head=3.59, width=2.12, thickness=0.38;
    // No poner un paño completo detrás de los vanos: eso anulaba las ventanas.
    wallBox(mat,x,sill/2,(z0+z1)/2,thickness,sill,z1-z0);
    if(upperCenters.length) {
      const upperSill=4.08, upperHead=5.62;
      wallBox(mat,x,(head+upperSill)/2,(z0+z1)/2,thickness,upperSill-head,z1-z0);
      wallBox(mat,x,(upperHead+wallHeight)/2,(z0+z1)/2,thickness,wallHeight-upperHead,z1-z0);
      let upperEdge=z0;
      for(const uz of upperCenters) {
        const near=uz-width/2;
        if(near>upperEdge) wallBox(mat,x,(upperSill+upperHead)/2,(upperEdge+near)/2,thickness,upperHead-upperSill,near-upperEdge);
        upperEdge=uz+width/2;
      }
      if(upperEdge<z1) wallBox(mat,x,(upperSill+upperHead)/2,(upperEdge+z1)/2,thickness,upperHead-upperSill,z1-upperEdge);
    } else wallBox(mat,x,(head+wallHeight)/2,(z0+z1)/2,thickness,wallHeight-head,z1-z0);
    let edge=z0;
    for(const z of centers) {
      const near=z-width/2;
      if(near>edge) wallBox(mat,x,(sill+head)/2,(edge+near)/2,thickness,head-sill,near-edge);
      edge=z+width/2;
    }
    if(edge<z1) wallBox(mat,x,(sill+head)/2,(edge+z1)/2,thickness,head-sill,z1-edge);
  };
  // cuerpos principales: ala blanca, nave central pétrea y ala de laboratorios.
  frontWallWithWindows(M.white,1,13,20.19,[[2.3,1.9],[5.8,1.9],[9.4,1.9]]);
  frontWallWithWindows(M.darkConcrete,47,59,20.19,[[49.2,1.85],[53.4,1.85],[57,1.85]],0.38,6.4,[[49.2,1.8],[53.4,1.8],[57,1.8]]);
  sideWallWithWindows(M.white,1.19,0,20,[2.4,6.5,10.6,14.7,18.2]);
  sideWallWithWindows(M.darkConcrete,58.81,0,20,[2,6.2,10.4,14.6,18.5],6.4,[2,6.2,10.4,14.6,18.5]);
  wallBox(M.white,7,2.125,0.19,12,4.25,0.38);
  wallBox(M.darkConcrete,53,3.2,0.19,12,6.4,0.38);
  // Nave central con vano real de acceso para permitir el recorrido de cámara.
  shell.add(mesh(boxUV(36, 4.25, 0.38, 4), M.darkConcrete, cx, 2.125, -1.31));
  // Fachada frontal segmentada para que el vano de entrada sea un hueco real.
  shell.add(mesh(boxUV(0.38, 4.25, 22.62, 4), M.darkConcrete, 12.19, 2.125, 10));
  // Paso real hacia alta tensión, alineado con la puerta acristalada y el portón de malla.
  wallBox(M.darkConcrete,47.81,3.2,3.69,0.38,6.4,10.0);
  wallBox(M.darkConcrete,47.81,3.2,16.31,0.38,6.4,10.0);
  wallBox(M.darkConcrete,47.81,4.51,10,0.38,3.78,2.62);
  B.add(M.darkMetal,47.81,1.5,8.69,0.12,3.0,0.12);
  B.add(M.darkMetal,47.81,1.5,11.31,0.12,3.0,0.12);
  B.add(M.darkMetal,47.81,3.08,10,0.13,0.14,2.62);
  // Dos hojas transparentes abatidas contra el muro: el paso queda libre y se entiende como puerta.
  for(const [hinge,angle,offset] of [[8.72,Math.PI/2,1.18],[11.28,-Math.PI/2,-1.18]]) {
    const leaf=new THREE.Group(); leaf.position.set(47.72,0.08,hinge); leaf.rotation.y=angle;
    leaf.add(mesh(new THREE.BoxGeometry(0.055,2.82,1.18),windowGlass,0,1.41,offset,{cast:false}));
    leaf.add(mesh(new THREE.BoxGeometry(0.065,2.88,0.055),M.darkMetal,0,1.44,offset+Math.sign(offset)*0.56));
    shell.add(leaf);
  }
  frontWallWithWindows(M.darkConcrete,12,26.1,21.31,[[16.7,1.75],[20.5,1.75],[24,1.75]]);
  frontWallWithWindows(M.darkConcrete,33.9,48,21.31,[[36,1.75],[39.5,1.75],[43.3,1.75]]);
  shell.add(mesh(boxUV(8.0, 0.55, 0.38, 4), M.darkConcrete, cx, 4.0, 21.31));
  // Se omiten los zócalos macizos bajo las alas: antes llenaban el interior
  // hasta 52 cm de altura y tapaban ruedas, puertas y equipos.
  gabledRoof(roof, 7, cz, 12.8, 21, 4.3, 5.1, redRoof);
  gabledRoof(roof, cx, cz, 37, 24, 4.4, 5.45, redRoof);
  gabledRoof(roof, 53, cz, 12.8, 21, 6.3, 7.15, redRoof);
  // Cumbreras, canaletas y bajantes pluviales visibles en el borde del techo.
  roofB.add(M.darkMetal, 7, 5.12, cz, 12.9, 0.1, 0.12);
  roofB.add(M.darkMetal, cx, 5.47, cz, 37.1, 0.1, 0.12);
  roofB.add(M.darkMetal, 53, 7.26, cz, 12.9, 0.1, 0.12);
  for (const [x, w, d, eave] of [[7,12.8,21,4.22],[30,37,24,4.32],[53,12.8,21,6.22]]) {
    roofB.add(M.darkMetal, x, eave, cz + d / 2, w, 0.12, 0.16);
    roofB.add(M.darkMetal, x, eave, cz - d / 2, w, 0.12, 0.16);
  }
  // Nervaduras de chapa roja: las líneas siguen las dos pendientes del techo.
  for(const [x,w,d,eave,ridge] of [[7,12.8,21,4.3,5.1],[30,37,24,4.4,5.45],[53,12.8,21,6.3,7.15]]) {
    for(let side of [-1,1]) for(let k=1;k<=7;k++) {
      const q=k/8, z=10+side*(d/2-q*d/2), y=eave+q*(ridge-eave)+0.035;
      roofB.add(redRoof,x,y,z,w,0.055,0.055);
    }
  }
  for (const [x,z] of [[0.8,20.4],[13.1,20.4],[11.5,-0.5],[48,-0.5]]) {
    B.add(M.darkMetal, x, 2.2, z, 0.12, 4.3, 0.12);
  }
  for(const [x,z] of [[47,20.5],[59,20.5]]) B.add(M.darkMetal,x,3.25,z,0.12,6.5,0.12);

  // Acceso central retranqueado con paños de vidrio oscuro, marcos y tiradores.
  B.add(M.darkMetal, 26.0, 2.0, 21.62, 0.18, 3.8, 0.2);
  B.add(M.darkMetal, 34.0, 2.0, 21.62, 0.18, 3.8, 0.2);
  B.add(M.darkMetal, cx, 3.9, 21.62, 8.2, 0.18, 0.2);
  // Puertas dobles alineadas en el vano; cerradas pero transparentes, sin hojas
  // atravesadas ni huecos laterales que parezcan una separaciÃ³n en la entrada.
  for (const [hinge, side, angle] of [[26.1,1,0],[33.9,-1,0]]) {
    const leaf = new THREE.Group();
    leaf.position.set(hinge,0.2,21.7);
    leaf.rotation.y = angle;
    // Vidrio claro en las hojas abatidas: M.glass es opaco y se leía como
    // un paño de pared bloqueando la entrada.
    leaf.add(mesh(new THREE.BoxGeometry(3.85,3.25,0.09),windowGlass,side*1.925,1.62,0,{cast:false}));
    leaf.add(mesh(new THREE.BoxGeometry(0.07,3.25,0.11),M.darkMetal,side*3.8,1.62,0));
    leaf.add(mesh(new THREE.BoxGeometry(0.06,3.25,0.11),M.darkMetal,0,1.62,0));
    leaf.add(mesh(new THREE.BoxGeometry(0.055,3.25,0.08),M.mullion,side*1.9,1.62,0.04));
    shell.add(leaf);
  }
  // Marquesina de ingreso, apoyada en columnas delgadas.
  B.add(M.darkMetal, cx, 4.0, 23.6, 14.5, 0.22, 5.5);
  B.add(redRoof, cx, 4.15, 23.6, 14.3, 0.12, 5.3);
  for (const x of [23.5, 36.5]) B.add(M.darkMetal, x, 2.0, 25.5, 0.16, 4.0, 0.16);
  // Escalinata ancha y descanso frontal.
  for (let i = 0; i < 6; i++) {
    const h = 0.16 + i * 0.16;
    B.add(M.concrete, cx, 0.1 + h / 2, 25.4 - i * 0.43, 10.4, h, 0.48);
  }
  B.add(M.concrete, cx, 0.16, 26.85, 11.2, 0.24, 1.6);
  // Rampa accesible en el costado de la escalera y barandas metálicas.
  const ramp = mesh(new THREE.BoxGeometry(2.6, 0.16, 5.6), M.concrete, 39.7, 0.62, 24.2);
  ramp.rotation.x = 0.16;
  shell.add(ramp);
  for (const x of [38.25, 41.15]) {
    const rail = mesh(new THREE.BoxGeometry(0.055, 0.055, 5.8), M.darkMetal, x, 1.12, 24.1);
    rail.rotation.x = 0.16; shell.add(rail);
    for (const z of [21.7, 23.2, 24.8, 26.3]) B.add(M.darkMetal, x, 0.65, z, 0.055, 0.95, 0.055);
  }

  // Ventanas enmarcadas y protegidas con rejas finas, como en las fotos.
  const frontWindow = (x, z, w = 2.0, h = 2.0, centerY = 2.55) => {
    // Antes este panel sólido del tamaño de toda la ventana quedaba detrás
    // del vidrio y lo volvía opaco. Ahora solo quedan cuatro perfiles finos.
    const frameZ=z+0.13, frameD=0.09, frameW=0.075;
    for(const side of [-1,1]) B.add(M.mullion,x+side*(w/2+0.07),centerY,frameZ,frameW,h+0.22,frameD);
    for(const side of [-1,1]) B.add(M.mullion,x,centerY+side*(h/2+0.07),frameZ,w+0.22,frameW,frameD);
    B.add(windowGlass,x,centerY,z+0.105,w,h,0.045);
  };
  for (const x of [49.2, 53.4, 57]) frontWindow(x, 20.40, 1.85, 1.75);
  for (const x of [49.2,53.4,57]) frontWindow(x,20.40,1.8,1.5,4.85);
  for (const x of [2.3, 5.8, 9.4]) frontWindow(x, 20.40, 1.9, 2.0);
  // Ventanas en los paños de piedra que flanquean la entrada principal.
  for (const x of [16.7,20.5,24]) frontWindow(x,21.52,1.75,1.85);
  for (const x of [36,39.5,43.3]) frontWindow(x,21.52,1.75,1.85);
  // Ventanas altas del costado oriental.
  for (const z of [2, 6.2, 10.4, 14.6, 18.5]) {
    for(const side of [-1,1]) B.add(M.mullion,59.08,2.55,z+side*1.12,0.1,2.24,0.075);
    for(const side of [-1,1]) B.add(M.mullion,59.08,2.55+side*1.12,z,0.1,0.075,2.24);
    B.add(windowGlass, 59.19, 2.55, z, 0.045, 2.08, 2.12);
  }
  for(const z of [2,6.2,10.4,14.6,18.5]) {
    for(const side of [-1,1]) B.add(M.mullion,59.08,4.85,z+side*1.12,0.1,1.68,0.075);
    for(const side of [-1,1]) B.add(M.mullion,59.08,4.85+side*0.82,z,0.1,0.075,2.24);
    B.add(windowGlass,59.19,4.85,z,0.045,1.5,2.12);
  }
  // Franja horizontal que marca el entrepiso y hace legible la doble altura.
  B.add(M.mullion,53,3.84,20.43,12.1,0.12,0.12);
  B.add(M.mullion,59.04,3.84,10,0.12,0.12,20.1);
  // Ventanas adicionales en la fachada lateral occidental del ala izquierda.
  for(const z of [2.4,6.5,10.6,14.7,18.2]) {
    for(const side of [-1,1]) B.add(M.mullion,0.91,2.55,z+side*1.12,0.1,2.24,0.075);
    for(const side of [-1,1]) B.add(M.mullion,0.91,2.55+side*1.12,z,0.1,0.075,2.24);
    B.add(windowGlass,0.78,2.55,z,0.045,2.08,2.12);
    B.add(M.mullion,0.72,1.48,z,0.12,0.075,2.35);
  }
  // Rótulo eléctrico de alto contraste, adelantado bajo el alero para que
  // la cubierta no tape las letras desde el patio.
  const signBlue = new THREE.MeshStandardMaterial({color:0x123b63,roughness:0.38,metalness:0.22,emissive:0x071b2b,emissiveIntensity:0.18});
  const signYellow = new THREE.MeshStandardMaterial({color:0xffc629,roughness:0.36,metalness:0.12,emissive:0x5c3900,emissiveIntensity:0.2});
  // Colocarlo en la cara exterior de la marquesina para que el alero no lo tape.
  B.add(signBlue,cx,3.93,26.46,9.8,0.92,0.16);
  B.add(signYellow,cx,4.39,26.56,9.8,0.055,0.035);
  B.add(signYellow,cx,3.47,26.56,9.8,0.055,0.035);
  const boltShape=new THREE.Shape();
  boltShape.moveTo(-0.12,0.34); boltShape.lineTo(0.18,0.34); boltShape.lineTo(0.02,0.04);
  boltShape.lineTo(0.22,0.04); boltShape.lineTo(-0.18,-0.36); boltShape.lineTo(-0.08,-0.08); boltShape.lineTo(-0.28,-0.08); boltShape.closePath();
  const bolt=new THREE.Mesh(new THREE.ShapeGeometry(boltShape),signYellow);
  bolt.position.set(26.05,3.93,26.57); shell.add(bolt);
  const hSign = new THREE.Mesh(new THREE.PlaneGeometry(7.8,0.62), new THREE.MeshBasicMaterial({map:textTex('BLOQUE H · ELECTRICIDAD',{w:1200,h:120,font:'700 72px Arial',color:'#f5f8fa',spacing:1}),transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  hSign.position.set(30.65,3.93,26.57); shell.add(hSign);
  for (const x of [25,35]) {
    const lamp = new THREE.PointLight(0xffd8ae,0,8,2);
    lamp.position.set(x,4.25,26.2); lamp.userData.I=3.5; shell.add(lamp); lights.push(lamp);
  }

  // Jardineras recortadas y vegetación baja junto a la entrada.
  const shrubGeo = new THREE.IcosahedronGeometry(1, 2);
  const shrubMats = [
    new THREE.MeshStandardMaterial({ color: 0x426b35, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0x587c3d, roughness: 1 }),
  ];
  for (const x of [14, 20, 42, 48]) {
    B.add(M.darkConcrete, x, 0.34, 27.1, 4.7, 0.55, 2.2);
    B.add(M.lawn, x, 0.64, 27.1, 4.35, 0.1, 1.9);
    for (let j = 0; j < 5; j++) {
      const s = 0.42 + (j % 2) * 0.08;
      const bush = mesh(shrubGeo, shrubMats[j % 2], x - 1.6 + j*0.8, 1.0, 27.1 + (j%2)*0.2, { cast: true, receive: true });
      bush.scale.set(1.15 * s, 0.8 * s, 0.95 * s); shell.add(bush);
    }
  }
  // Plazoleta ajardinada con bancas y fuente escultórica de la Virgen.
  B.add(M.darkConcrete,55,0.22,39,15.5,0.34,13.0);
  B.add(M.lawn,55,0.34,39,15.0,0.12,12.5);
  for(const x of [47.5,62.5]) {
    B.add(M.darkConcrete,x,0.55,39,0.34,0.54,10.8);
    for(const z of [34,44]) {
      const bush=mesh(shrubGeo,shrubMats[(Math.round(x+z)%2)],x,0.96,z,{cast:true,receive:true});
      bush.scale.set(0.42,0.55,0.62); shell.add(bush);
    }
  }
  for(const z of [33,45]) B.add(M.darkConcrete,55,0.55,z,14.8,0.54,0.34);
  // Sendero de losas desde las escalinatas hasta la plazoleta.
  for(const [x,z] of [[34,29],[38,30.5],[42,32]]) B.add(M.paver,x,0.24,z,3.4,0.12,1.9,-0.28);
  // Fuente circular baja con vaso de piedra, agua y pequeños surtidores.
  const FX=55,FZ=39.2;
  shell.add(mesh(new THREE.CylinderGeometry(2.0,2.18,0.5,48),M.concrete,FX,0.43,FZ));
  const fountainWater=mesh(new THREE.CircleGeometry(1.78,48),M.water,FX,0.69,FZ,{cast:false});
  fountainWater.rotation.x=-Math.PI/2; shell.add(fountainWater);
  shell.add(mesh(new THREE.CylinderGeometry(0.62,0.72,0.52,24),M.concrete,FX,0.84,FZ));
  shell.add(mesh(new THREE.CylinderGeometry(0.43,0.51,0.35,24),M.darkConcrete,FX,1.24,FZ));
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4, x=FX+Math.cos(a)*1.43, z=FZ+Math.sin(a)*1.43;
    B.add(M.steel,x,0.82,z,0.16,0.1,0.16);
    const jetMat=new THREE.MeshBasicMaterial({color:0x91e4ff,transparent:true,opacity:0.78,depthWrite:false});
    const jet=mesh(new THREE.CylinderGeometry(0.024,0.04,1,8),jetMat,x,1.1,z,{cast:false});
    jet.scale.y=0.44; shell.add(jet); fountainJets.push({mesh:jet,a,x,z,phase:i*0.61});
    const dropMat=new THREE.MeshBasicMaterial({color:0xc7f4ff,transparent:true,opacity:0.92,depthWrite:false});
    for(let k=0;k<2;k++) {
      const drop=mesh(new THREE.SphereGeometry(0.045,8,6),dropMat,x,0.9,z,{cast:false});
      shell.add(drop); fountainDrops.push({mesh:drop,a,x,z,phase:i*0.37+k*0.5});
    }
  }
  const animateFountain=(time)=>{
    for(const j of fountainJets) {
      const h=0.25+0.32*(0.5+0.5*Math.sin(time*3.2+j.phase));
      j.mesh.scale.y=h; j.mesh.position.y=0.87+h/2;
    }
    for(const d of fountainDrops) {
      const u=(time*0.72+d.phase)%1, arc=4*0.52*u*(1-u), r=1.43+0.26*u;
      d.mesh.position.set(FX+Math.cos(d.a)*r,0.88+arc,FZ+Math.sin(d.a)*r);
      const s=0.55+0.45*Math.sin(Math.PI*u); d.mesh.scale.setScalar(s);
    }
  };
  // Figura de la Virgen: manto, túnica, velo, halo y manos juntas.
  const statue=new THREE.Group(); statue.position.set(FX,1.40,FZ); shell.add(statue);
  const marble=new THREE.MeshStandardMaterial({color:0xe4e0d5,roughness:0.82});
  const mantle=new THREE.MeshStandardMaterial({color:0x7189a2,roughness:0.78});
  statue.add(mesh(new THREE.ConeGeometry(0.47,1.18,20,1),marble,0,0.59,0));
  const shoulders=mesh(new THREE.SphereGeometry(0.39,20,14),marble,0,1.02,0);
  shoulders.scale.set(1.0,0.72,0.72); statue.add(shoulders);
  const veil=mesh(new THREE.SphereGeometry(0.25,20,14),marble,0,1.39,-0.035);
  veil.scale.set(0.92,1.3,0.78); statue.add(veil);
  statue.add(mesh(new THREE.SphereGeometry(0.145,20,16),marble,0,1.42,0.105));
  const halo=mesh(new THREE.TorusGeometry(0.24,0.035,10,32),new THREE.MeshStandardMaterial({color:0xb89759,metalness:0.42,roughness:0.45}),0,1.46,-0.15);
  statue.add(halo);
  // Manto azul frontal y ribete dorado fino.
  const mantlePanel=mesh(new THREE.ConeGeometry(0.35,0.92,16,1, true),mantle,0,0.76,0.19);
  mantlePanel.scale.set(1.0,1.0,0.22); statue.add(mantlePanel);
  const robeTrim=new THREE.MeshStandardMaterial({color:0xc1a76c,metalness:0.28,roughness:0.55});
  statue.add(mesh(new THREE.BoxGeometry(0.045,0.74,0.035),robeTrim,0,0.77,0.31));
  const arm=(a,b,r=0.075)=>{
    const p0=new THREE.Vector3(...a),p1=new THREE.Vector3(...b),d=p1.clone().sub(p0);
    const limb=mesh(new THREE.CylinderGeometry(r*0.78,r,d.length(),12),marble);
    limb.position.copy(p0.add(p1).multiplyScalar(0.5)); limb.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); statue.add(limb);
  };
  arm([-0.29,1.0,0.02],[-0.12,0.68,0.28]); arm([0.29,1.0,0.02],[0.12,0.68,0.28]);
  statue.add(mesh(new THREE.SphereGeometry(0.095,14,10),marble,0,0.67,0.31));
  // Bancas de madera con respaldo y patas metálicas alrededor del jardín.
  const bench=(x,z)=>{
    B.add(M.woodPlain,x,0.68,z,2.2,0.12,0.55);
    B.add(M.woodPlain,x,1.03,z-0.22,2.2,0.56,0.11);
    for(const dx of [-0.82,0.82]) {
      B.add(M.darkMetal,x+dx,0.43,z,0.11,0.52,0.42);
      B.add(M.darkMetal,x+dx,0.98,z-0.22,0.08,0.94,0.08);
    }
    for(const y of [0.84,1.0,1.16]) B.add(M.woodPlain,x,y,z-0.22,2.2,0.075,0.08);
  };
  bench(50,35.6); bench(60,35.6);
  B.build(shell);
  roofB.build(roof);
  buildBlockHInterior(interior);
  return { shell, roof, interior, lights, animateFountain };
}

function buildElectricPrototype(parent, x, z) {
  const car = new THREE.Group();
  // Asentar neumáticos directamente sobre el piso interior (cota superior 0.14 m).
  car.position.set(x, 0.105, z);
  parent.add(car);
  const tire = new THREE.MeshStandardMaterial({ color: 0x090b0d, roughness: 0.94 });
  const rubberTrim = new THREE.MeshStandardMaterial({ color: 0x11151b, roughness: 0.66, metalness: 0.12 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffc936, roughness: 0.34, metalness: 0.2, clearcoat: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf0f2f0, roughness: 0.3, metalness: 0.12, clearcoat: 0.9 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x144986, roughness: 0.34, metalness: 0.18, clearcoat: 0.75 });
  const glass = new THREE.MeshPhysicalMaterial({ color:0xd8f3fa, roughness:0.06, metalness:0, transparent:true, opacity:0.16, transmission:0.5, thickness:0.012, ior:1.12, side:THREE.DoubleSide, depthWrite:false });
  const bodyPaint = new THREE.MeshStandardMaterial({ color:0x11171d, roughness:0.36, metalness:0.16, clearcoat:0.72, clearcoatRoughness:0.26 });
  // Las caras laterales grandes son vidrio visualmente abierto para que no
  // oculten los asientos y el volante que están dentro de la carrocería.
  const bodySide = bodyPaint.clone(); bodySide.transparent=true; bodySide.opacity=0.08; bodySide.depthWrite=false;
  const rim = new THREE.MeshStandardMaterial({ color: 0xb8c1c6, roughness: 0.26, metalness: 0.82 });

  const base = mesh(new THREE.BoxGeometry(4.05, 0.38, 1.65), rubberTrim, 0, 0.56, 0);
  car.add(base);
  const profile = new THREE.Shape();
  profile.moveTo(-2.05, 0.42); profile.lineTo(1.86, 0.42); profile.quadraticCurveTo(2.18, 0.46, 2.15, 0.78);
  profile.lineTo(1.65, 0.94); profile.lineTo(1.15, 1.35); profile.quadraticCurveTo(0.94, 1.52, 0.56, 1.53);
  profile.lineTo(-0.78, 1.5); profile.quadraticCurveTo(-1.13, 1.48, -1.36, 1.21);
  profile.lineTo(-1.78, 0.98); profile.lineTo(-2.13, 0.82); profile.quadraticCurveTo(-2.28, 0.66, -2.05, 0.42);
  const bodyGeo = new THREE.ExtrudeGeometry(profile, { depth: 1.55, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.055, bevelThickness: 0.055 });
  bodyGeo.translate(0, 0, -0.775);
  car.add(mesh(bodyGeo, [bodySide,bodyPaint]));

  // Techo amarillo envolvente y parabrisas panorámico.
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-1.42, 1.18); roofShape.lineTo(-0.86, 1.49); roofShape.quadraticCurveTo(-0.6, 1.61, -0.3, 1.61);
  roofShape.lineTo(0.48, 1.59); roofShape.quadraticCurveTo(0.8, 1.55, 1.08, 1.34); roofShape.lineTo(1.53, 0.96);
  roofShape.lineTo(1.31, 1.13); roofShape.lineTo(0.74, 1.46); roofShape.lineTo(-0.78, 1.45); roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1.62, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2 });
  roofGeo.translate(0, 0, -0.81); car.add(mesh(roofGeo, yellow));
  // Parabrisas inclinado, luna trasera y cabina interior de dos plazas.
  const windshield=mesh(new THREE.BoxGeometry(0.075,0.58,1.34),glass,1.35,1.18,0,{cast:false});
  windshield.rotation.z=0.67; car.add(windshield);
  const rearGlass=mesh(new THREE.BoxGeometry(0.075,0.46,1.25),glass,-1.48,1.2,0,{cast:false});
  rearGlass.rotation.z=-0.48; car.add(rearGlass);
  const seatMat=new THREE.MeshStandardMaterial({color:0x222a31,roughness:0.88});
  const seatFabric=new THREE.MeshStandardMaterial({color:0x303b43,roughness:0.94});
  for(const side of [-1,1]) {
    car.add(mesh(new THREE.BoxGeometry(0.5,0.46,0.45),seatMat,-0.15,0.94,side*0.34));
    car.add(mesh(new THREE.BoxGeometry(0.48,0.55,0.12),seatFabric,-0.38,1.18,side*0.34));
    car.add(mesh(new THREE.BoxGeometry(0.26,0.2,0.16),seatMat,-0.43,1.55,side*0.34));
    for(const dx of [-0.48,-0.3]) car.add(mesh(new THREE.BoxGeometry(0.018,0.4,0.014),new THREE.MeshStandardMaterial({color:0x56636a,roughness:0.95}),dx,1.19,side*0.405));
    // Cinturones y cierres rojos visibles a través del acristalamiento claro.
    const belt=mesh(new THREE.BoxGeometry(0.035,0.62,0.025),new THREE.MeshStandardMaterial({color:0x384047,roughness:0.78}),-0.12,1.16,side*0.56);
    belt.rotation.z=-0.55; car.add(belt);
    car.add(mesh(new THREE.BoxGeometry(0.11,0.055,0.07),new THREE.MeshStandardMaterial({color:0xb44034,roughness:0.5}),0.04,0.78,side*0.43));
  }
  // Tablero envolvente, dos relojes, pantalla central y volante orientado al conductor.
  car.add(mesh(new THREE.BoxGeometry(0.42,0.2,1.34),rubberTrim,0.86,1.08,0));
  car.add(mesh(new THREE.BoxGeometry(0.2,0.12,0.42),new THREE.MeshStandardMaterial({color:0x273b49,emissive:0x101b24,roughness:0.32}),0.92,1.2,0));
  for(const side of [-1,1]) {
    const gauge=mesh(new THREE.CylinderGeometry(0.065,0.065,0.025,18),rim,0.98,1.2,side*0.38);
    gauge.rotation.z=Math.PI/2; car.add(gauge);
    const gaugeFace=mesh(new THREE.CircleGeometry(0.048,18),new THREE.MeshBasicMaterial({color:0x9fc9d2}),0.996,1.2,side*0.38);
    gaugeFace.rotation.y=Math.PI/2; car.add(gaugeFace);
  }
  car.add(mesh(new THREE.BoxGeometry(0.16,0.2,0.12),rubberTrim,0.94,0.91,0));
  const wheel=new THREE.Mesh(new THREE.TorusGeometry(0.16,0.022,8,24),rubberTrim);
  wheel.position.set(0.94,1.16,0.3); wheel.rotation.y=Math.PI/2; car.add(wheel);
  const wheelHub=mesh(new THREE.CylinderGeometry(0.045,0.045,0.08,12),rim,0.94,1.16,0.3);
  wheelHub.rotation.z=Math.PI/2; car.add(wheelHub);
  // Tres radios del volante, columna de dirección y retrovisor interior.
  for(const [y,z,ry] of [[1.24,0.3,0],[1.1,0.19,0.72],[1.1,0.41,-0.72]]) {
    const spoke=mesh(new THREE.BoxGeometry(0.025,0.19,0.026),rim,0.94,y,z);
    spoke.rotation.x=ry; car.add(spoke);
  }
  const steeringColumn=mesh(new THREE.CylinderGeometry(0.035,0.045,0.28,10),rubberTrim,0.8,1.06,0.3);
  steeringColumn.rotation.z=Math.PI/2; car.add(steeringColumn);
  car.add(mesh(new THREE.BoxGeometry(0.18,0.07,0.035),rubberTrim,0.35,1.55,0));
  car.add(mesh(new THREE.BoxGeometry(0.035,0.18,0.035),M.darkMetal,0.42,1.47,0));
  // Limpiaparabrisas dobles visibles sobre la base del parabrisas.
  for(const side of [-1,1]) {
    const wiper=mesh(new THREE.BoxGeometry(0.035,0.025,0.55),rubberTrim,1.62,0.96,side*0.23);
    wiper.rotation.x=side*0.12; car.add(wiper);
    car.add(mesh(new THREE.BoxGeometry(0.12,0.035,0.035),M.darkMetal,1.6,0.98,side*0.23));
  }

  const sideShape = (points) => {
    const s = new THREE.Shape();
    points.forEach(([px, py], i) => i ? s.lineTo(px, py) : s.moveTo(px, py));
    s.closePath();
    return s;
  };
  for (const side of [-1, 1]) {
    const zSide = side * 0.86;
    const window1 = new THREE.Mesh(new THREE.ShapeGeometry(sideShape([[-1.25,1.15],[-0.78,1.44],[-0.25,1.45],[-0.25,1.12]])), glass);
    window1.position.z = zSide; car.add(window1);
    const window2 = new THREE.Mesh(new THREE.ShapeGeometry(sideShape([[-0.12,1.12],[-0.1,1.45],[0.55,1.45],[0.95,1.24],[1.17,1.07]])), glass);
    window2.position.z = zSide; car.add(window2);
    const lowerBody = new THREE.Mesh(new THREE.ShapeGeometry(sideShape([[-1.72,0.47],[1.82,0.47],[1.72,0.91],[1.22,1.03],[-1.35,0.99],[-1.68,0.79]])), rubberTrim.clone());
    lowerBody.material.side = THREE.DoubleSide;
    lowerBody.position.z = side * 0.846; car.add(lowerBody);
    // Arco amarillo de seguridad y pilares que enmarcan los grandes cristales.
    const strut = (a,b,r=0.055) => {
      const p0=new THREE.Vector3(a[0],a[1],side*0.88), p1=new THREE.Vector3(b[0],b[1],side*0.88);
      const d=p1.clone().sub(p0), tube=mesh(new THREE.CylinderGeometry(r*0.82,r,d.length(),12),yellow);
      tube.position.copy(p0.add(p1).multiplyScalar(0.5));
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); car.add(tube);
    };
    strut([-1.48,1.13],[-0.82,1.52],0.07);
    strut([-0.82,1.52],[0.56,1.52],0.07);
    strut([0.56,1.52],[1.51,0.98],0.07);
    strut([-0.18,1.13],[-0.18,1.49],0.045);
    const panel = new THREE.Mesh(new THREE.ShapeGeometry(sideShape([[-1.57,0.58],[1.55,0.58],[1.7,0.88],[-1.42,0.86]])), white.clone());
    panel.material.side = THREE.DoubleSide;
    panel.position.z = side * 0.864; car.add(panel);
    const stripe = mesh(new THREE.BoxGeometry(2.9, 0.105, 0.035), blue, 0, 0.91, side * 0.882);
    car.add(stripe);
    const badgeShape=new THREE.Shape();
    badgeShape.moveTo(-1.05,-0.15); badgeShape.lineTo(1.05,-0.15);
    badgeShape.quadraticCurveTo(1.22,-0.15,1.22,0); badgeShape.quadraticCurveTo(1.22,0.15,1.05,0.15);
    badgeShape.lineTo(-1.05,0.15); badgeShape.quadraticCurveTo(-1.22,0.15,-1.22,0); badgeShape.quadraticCurveTo(-1.22,-0.15,-1.05,-0.15);
    const badge=new THREE.Mesh(new THREE.ShapeGeometry(badgeShape),blue);
    badge.material=blue.clone(); badge.material.side=THREE.DoubleSide;
    badge.position.set(-0.05,0.72,side*0.888); car.add(badge);
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(2.3,0.28),new THREE.MeshBasicMaterial({map:textTex('CARRERA DE ELECTRICIDAD',{w:720,h:100,font:'700 34px Arial',color:'#fff',spacing:0,bg:null}),transparent:true,side:THREE.DoubleSide,depthWrite:false}));
    decal.position.set(-0.05,0.72,side*0.895); car.add(decal);
    const upsDecal=new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.24),new THREE.MeshBasicMaterial({map:textTex('UPS',{w:256,h:120,font:'700 70px Arial',color:'#fff',bg:'#1b6a4a'}),side:THREE.DoubleSide}));
    upsDecal.position.set(1.15,0.73,side*0.892); car.add(upsDecal);
    const teamBadge = new THREE.Mesh(new THREE.PlaneGeometry(0.75,0.19),new THREE.MeshBasicMaterial({map:textTex('GIERI - UPS',{w:300,h:76,font:'700 34px Arial',color:'#f1f3f4',bg:'#16191d'}),side:THREE.DoubleSide}));
    teamBadge.position.set(-0.42,0.55,side*0.89); car.add(teamBadge);
    const sponsorBadge = new THREE.Mesh(new THREE.PlaneGeometry(0.78,0.19),new THREE.MeshBasicMaterial({map:textTex('SALESIANA',{w:320,h:76,font:'700 32px Arial',color:'#f1f3f4',bg:'#16191d'}),side:THREE.DoubleSide}));
    sponsorBadge.position.set(0.48,0.55,side*0.89); car.add(sponsorBadge);
    // Tornillos de puerta, bisagras y remates del panel de carrocería.
    for(const [px,py] of [[-1.42,0.66],[-1.38,0.83],[1.42,0.66],[1.36,0.83]]) {
      const bolt=mesh(new THREE.CylinderGeometry(0.035,0.035,0.025,12),rim,px,py,side*0.897);
      bolt.rotation.x=Math.PI/2; car.add(bolt);
    }
    const sill = mesh(new THREE.BoxGeometry(2.8, 0.11, 0.05), rubberTrim, 0, 0.48, side * 0.81);
    car.add(sill);
    car.add(mesh(new THREE.BoxGeometry(2.55,0.075,0.055),blue,0,0.52,side*0.866));
    car.add(mesh(new THREE.BoxGeometry(0.78,0.065,0.055),yellow,-1.0,1.015,side*0.865));
    car.add(mesh(new THREE.BoxGeometry(0.68,0.065,0.055),yellow,1.18,1.015,side*0.865));
    car.add(mesh(new THREE.BoxGeometry(0.24, 0.07, 0.06), rim, 0.9, 1.0, side * 0.82));
    car.add(mesh(new THREE.BoxGeometry(0.2, 0.16, 0.14), rubberTrim, 0.08, 1.18, side * 0.86));
      // Retrovisor, manija y moldura de puerta para romper las superficies planas.
      const mirrorStem = mesh(new THREE.BoxGeometry(0.12, 0.07, 0.28), rubberTrim, 0.91, 1.08, side * 0.91);
      mirrorStem.rotation.y = side * 0.18; car.add(mirrorStem);
      car.add(mesh(new THREE.SphereGeometry(0.12, 12, 8), blue, 0.91, 1.13, side * 1.04));
      car.add(mesh(new THREE.BoxGeometry(0.38, 0.045, 0.035), rim, -0.88, 0.94, side * 0.824));
      car.add(mesh(new THREE.BoxGeometry(0.24, 0.045, 0.035), rubberTrim, 0.63, 0.82, side * 0.825));
    for (const wx of [-1.38, 1.38]) {
      // Desplazar las ruedas fuera del monocasco para que queden expuestas como en el cuadriciclo real.
      const wheel = mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.3, 32), tire, wx, 0.48, side * 0.98);
      wheel.rotation.x = Math.PI / 2; car.add(wheel);
      const wheelFace = mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.31, 24), rubberTrim, wx, 0.48, side * 0.98);
      wheelFace.rotation.x = Math.PI / 2; car.add(wheelFace);
        const brake = mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.035, 24), rim, wx, 0.48, side * 1.12);
        brake.rotation.x = Math.PI / 2; car.add(brake);
      const ring=mesh(new THREE.TorusGeometry(0.30,0.055,10,28),rim,wx,0.48,side*1.14); car.add(ring);
      for(let spoke=0;spoke<5;spoke++) {
        const a=spoke*Math.PI*2/5;
        const bar=mesh(new THREE.BoxGeometry(0.07,0.31,0.045),rim,wx+Math.cos(a)*0.13,0.48+Math.sin(a)*0.13,side*1.15);
        bar.rotation.z=a; car.add(bar);
      }
      const hub=mesh(new THREE.CylinderGeometry(0.085,0.085,0.3,16),rim,wx,0.48,side*0.98);
      hub.rotation.x=Math.PI/2; car.add(hub);
    }
  }
  // Paños de color, focos y matrícula del prototipo universitario.
  car.add(mesh(new THREE.BoxGeometry(0.12, 0.22, 0.72), new THREE.MeshStandardMaterial({ color: 0xfff0c2, emissive: 0x44351d, roughness: 0.25 }), 2.1, 0.77, 0));
  car.add(mesh(new THREE.BoxGeometry(0.1, 0.18, 0.72), new THREE.MeshStandardMaterial({ color: 0xff442c, emissive: 0x34100a, roughness: 0.28 }), -2.1, 0.73, 0));
  car.add(mesh(new THREE.BoxGeometry(0.12,0.24,0.86),rubberTrim,2.15,0.46,0));
  car.add(mesh(new THREE.BoxGeometry(0.12,0.2,0.86),rubberTrim,-2.15,0.45,0));
  car.add(mesh(new THREE.BoxGeometry(0.055,0.32,0.56),rubberTrim,2.22,0.7,0));
  for(const side of [-1,1]) {
    car.add(mesh(new THREE.BoxGeometry(0.18,0.12,0.22),rubberTrim,0.8,1.12,side*0.91));
    for(const wx of [-1.38,1.38]) {
      const arch=new THREE.Shape();
      arch.moveTo(wx-0.61,0.42); arch.quadraticCurveTo(wx,1.12,wx+0.61,0.42);
      arch.lineTo(wx+0.48,0.42); arch.quadraticCurveTo(wx,0.91,wx-0.48,0.42); arch.closePath();
      const fender=new THREE.Mesh(new THREE.ShapeGeometry(arch),rubberTrim);
      fender.position.z=side*0.97; fender.material.side=THREE.DoubleSide; car.add(fender);
    }
  }
    // Parrilla frontal, matrícula del prototipo y detalles de iluminación.
    car.add(mesh(new THREE.BoxGeometry(0.035,0.18,0.42),rubberTrim,2.225,0.65,0));
    for (let i=0;i<5;i++) car.add(mesh(new THREE.BoxGeometry(0.045,0.018,0.38),rim,2.25,0.58+i*0.035,0));
    for (const side of [-1,1]) {
      car.add(mesh(new THREE.BoxGeometry(0.06,0.13,0.28),new THREE.MeshStandardMaterial({color:0xfff8dc,emissive:0xffc55c,emissiveIntensity:0.45,roughness:0.22}),2.17,0.83,side*0.48));
      car.add(mesh(new THREE.BoxGeometry(0.06,0.12,0.24),new THREE.MeshStandardMaterial({color:0xe64c38,emissive:0x42110b,roughness:0.28}),-2.18,0.79,side*0.47));
    }
  const solar = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.025, 0.82), glass);
  solar.position.set(-0.1, 1.62, 0); car.add(solar);
  // Paquete de baterías bajo el piso, tapa de servicio y puerto de carga.
  car.add(mesh(new THREE.BoxGeometry(1.72,0.24,1.12),rubberTrim,-0.15,0.34,0));
  car.add(mesh(new THREE.BoxGeometry(0.42,0.12,0.28),M.darkMetal,-0.65,0.19,0.48));
  car.add(mesh(new THREE.CylinderGeometry(0.13,0.13,0.07,20),blue,-1.68,0.96,0.82));
  car.add(mesh(new THREE.CylinderGeometry(0.075,0.075,0.075,16),M.white,-1.68,0.96,0.86));
  // El referente es un cuadriciclo urbano de dos plazas, mucho menor que un automóvil normal.
  car.scale.set(0.75,0.8,0.75);
  return car;
}

function addHighVoltageBay(g, B) {
  const x0 = 47.7, x1 = 58.3, z0 = 3.4, z1 = 18.4, h = 4.75;
  const hazardPaint = new THREE.MeshStandardMaterial({ color:0xf0c23d, roughness:0.72 });
  // Cerramiento de seguridad de malla, con acceso frontal para prácticas.
  const fenceX = (x, a, b) => {
    const spans = Math.abs(x-x0)<0.01 ? [[a,8.7],[11.3,b]] : [[a,b]];
    for(const [lo,hi] of spans) {
      for (let z=lo; z<=hi; z+=0.3) B.add(M.darkMetal,x,h/2,z,0.035,h-0.1,0.035);
      for (let y=0.25;y<=h;y+=0.3) B.add(M.steel,x,y,(lo+hi)/2,0.035,0.035,hi-lo);
      B.add(M.darkMetal,x,h,(lo+hi)/2,0.08,0.09,hi-lo);
    }
  };
  const fenceZ = (z,a,b) => {
    for (let x=a; x<=b; x+=0.3) B.add(M.darkMetal,x,h/2,z,0.035,h-0.1,0.035);
    for (let y=0.25;y<=h;y+=0.3) B.add(M.steel,(a+b)/2,y,z,b-a,0.035,0.035);
    B.add(M.darkMetal,(a+b)/2,h,z,b-a,0.09,0.08);
  };
  fenceX(x0,z0,z1); fenceX(x1,z0,z1); fenceZ(z0,x0,x1);
  fenceZ(z1,x0,51.5); fenceZ(z1,54.5,x1); // abertura de acceso central
  for (const x of [x0,x1]) for (const z of [z0,z1]) B.add(M.darkMetal,x,h/2,z,0.12,h+0.25,0.12);
  // Portón peatonal doble del cerramiento de alta tensión.
  for(const z of [8.7,11.3]) B.add(M.darkMetal,x0,h/2,z,0.13,h+0.1,0.13);
  B.add(M.darkMetal,x0,h+0.05,10,0.1,0.09,2.6);
  // Franja amarilla de precaución alrededor del área de ensayos.
  for (let x=x0+0.25;x<x1-0.25;x+=0.72) {
    B.add(hazardPaint,x,0.17,z1+0.36,0.48,0.025,0.22);
    B.add(hazardPaint,x,0.17,z0-0.36,0.48,0.025,0.22);
  }

  const porcelain = new THREE.MeshStandardMaterial({ color:0xd8ddd8, roughness:0.34, metalness:0.08 });
  const insulator = (x,z,yBase,height,color=0x3a927e) => {
    const mat = color === 0x3a927e ? new THREE.MeshStandardMaterial({color,roughness:0.32,metalness:0.16}) : porcelain;
    g.add(mesh(new THREE.CylinderGeometry(0.12,0.18,height,14,2),mat,x,yBase+height/2,z));
    for(let i=1;i<7;i++) {
      const y=yBase+height*(i/8);
      const ring=mesh(new THREE.TorusGeometry(0.22-i*0.008,0.035,8,20),mat,x,y,z);
      ring.rotation.x=Math.PI/2; g.add(ring);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.2,0.2,0.08,16),M.steel,x,yBase+height,z));
  };

  // Transformador de prácticas y columnas aislantes de la bancada de alta tensión.
  B.add(M.darkConcrete,53,0.24,10.7,3.1,0.34,3.0);
  g.add(mesh(new THREE.CylinderGeometry(0.86,0.96,2.8,32,2),M.steel,53,1.8,10.7));
  g.add(mesh(new THREE.CylinderGeometry(0.93,0.93,0.16,32),M.darkMetal,53,3.29,10.7));
  g.add(mesh(new THREE.CylinderGeometry(0.82,0.82,0.14,32),M.white,53,3.42,10.7));
  // Aletas de refrigeración y bornes superiores del transformador de prácticas.
  for (let i=0;i<18;i++) {
    const a=i*Math.PI*2/18, x=53+Math.cos(a)*0.91, z=10.7+Math.sin(a)*0.91;
    const fin=mesh(new THREE.BoxGeometry(0.045,1.68,0.28),M.steel,x,1.8,z);
    fin.rotation.y=-a; g.add(fin);
  }
  for (const [x,z,h] of [[52.45,10.15,1.12],[53,10.7,1.42],[53.55,11.25,1.12]]) {
    insulator(x,z,3.48,h,0xd8ddd8);
    g.add(mesh(new THREE.CylinderGeometry(0.09,0.09,0.12,16),M.darkMetal,x,3.48+h+0.06,z));
  }
  // Pequeño manómetro frontal legible como detalle de instrumentación.
  g.add(mesh(new THREE.CylinderGeometry(0.22,0.22,0.08,24),M.white,53,1.55,11.67));
  g.add(mesh(new THREE.CylinderGeometry(0.025,0.025,0.18,8),new THREE.MeshStandardMaterial({color:0xb83a2d,roughness:0.55}),53,1.58,11.72));
  B.add(M.darkMetal,53,0.55,10.7,3.3,0.12,3.2);
  for(let i=0;i<12;i++) {
    const a=i*Math.PI/6, x=53+Math.cos(a)*0.88, z=10.7+Math.sin(a)*0.88;
    B.add(M.darkMetal,x,1.8,z,0.1,1.95,0.1,-a);
  }
  for(const [x,z] of [[50.2,8.1],[55.7,8.1],[50.2,14.6],[55.7,14.6]]) {
    B.add(M.darkConcrete,x,0.22,z,1.1,0.3,1.1);
    insulator(x,z,0.38,2.05);
  }
  for(const [x,z] of [[51.2,10.5],[53,10.5],[54.8,10.5]]) insulator(x,z,3.05,1.35,0x3a927e);

  // Barras de ensayo codificadas por color, soportes, terminales y puentes.
  const busbar = (y,z,color) => {
    const tube=mesh(new THREE.CylinderGeometry(0.075,0.075,6.8,16),new THREE.MeshStandardMaterial({color,roughness:0.3,metalness:0.35}),53,y,z);
    tube.rotation.z=Math.PI/2; g.add(tube);
  };
  busbar(4.95,9.2,0x277b61); busbar(4.95,12.2,0x2465a3);
  // Pórtico de ensayo elevado, con travesaño y aisladores de línea a escala de nave alta.
  for(const x of [50.0,56.0]) B.add(M.darkMetal,x,2.85,10.7,0.16,5.35,0.16);
  B.add(M.steel,53,5.52,10.7,6.2,0.18,0.2);
  for(const z of [9.2,10.7,12.2]) {
    insulator(53,z,5.58,0.55,0xd8ddd8);
    B.add(M.darkMetal,53,6.16,z,0.12,0.12,0.12);
  }
  for(const x of [50.3,55.7]) {
    B.add(M.steel,x,5.02,9.2,0.1,0.22,0.1);
    B.add(M.steel,x,5.02,12.2,0.1,0.22,0.1);
  }
  const wireMat = new THREE.MeshStandardMaterial({color:0x22272c,roughness:0.42,metalness:0.3});
  for(const [a,b] of [
    [[51.2,4.95,10.5],[53,5.15,9.2]], [[53,5.15,9.2],[54.8,4.95,10.5]],
    [[50.2,4.2,14.6],[51.2,4.85,10.5]], [[55.7,4.2,14.6],[54.8,4.85,10.5]],
  ]) {
    const path=new THREE.CatmullRomCurve3([new THREE.Vector3(...a),new THREE.Vector3((a[0]+b[0])/2,Math.max(a[1],b[1])+0.24,(a[2]+b[2])/2),new THREE.Vector3(...b)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(path,24,0.035,8,false),wireMat));
  }
  // Paneles didácticos de electricidad industrial con protecciones,
  // displays, bornes de banana y cables de prácticas.
  const socketMats=[
    new THREE.MeshStandardMaterial({color:0xb83e35,roughness:0.38}),
    new THREE.MeshStandardMaterial({color:0x2476ad,roughness:0.38}),
    new THREE.MeshStandardMaterial({color:0x202427,roughness:0.48}),
    new THREE.MeshStandardMaterial({color:0xe0b943,roughness:0.42}),
  ];
  const panelCenters=[5.5,9.0,14.9];
  panelCenters.forEach((zc,index)=>{
    B.add(M.darkMetal,48.55,1.62,zc,0.48,2.18,2.55);
    B.add(M.white,48.82,1.62,zc,0.08,1.9,2.28);
    B.add(M.darkMetal,48.88,2.25,zc,0.055,0.42,0.9);
    B.add(M.ledBlue,48.92,2.25,zc,0.028,0.24,0.58);
    for(let row=0;row<3;row++) for(let col=0;col<5;col++) {
      const y=1.1+row*0.38, z=zc-0.78+col*0.39;
      const mat=socketMats[(row+col+index)%socketMats.length];
      const socket=mesh(new THREE.CylinderGeometry(0.075,0.075,0.08,16),mat,48.93,y,z);
      socket.rotation.z=Math.PI/2; g.add(socket);
      const jack=mesh(new THREE.CylinderGeometry(0.028,0.028,0.085,12),M.darkMetal,48.985,y,z);
      jack.rotation.z=Math.PI/2; g.add(jack);
    }
    for(let k=0;k<3;k++) {
      const lever=mesh(new THREE.CylinderGeometry(0.035,0.045,0.28,10),M.steel,48.95,1.12,zc+0.66+k*0.22);
      lever.rotation.z=0.35; g.add(lever);
      B.add(M.darkMetal,48.94,0.9,zc+0.66+k*0.22,0.2,0.07,0.14);
    }
    const wireColors=[0xc43f36,0x236ba0,0x202326,0xe0b744];
    for(let k=0;k<4;k++) {
      const start=new THREE.Vector3(48.98,0.98+k*0.06,zc-0.48+k*0.2);
      const end=new THREE.Vector3(50.25,1.02,zc-0.85+k*0.42);
      const path=new THREE.CatmullRomCurve3([start,new THREE.Vector3(49.35,0.72,zc-0.3+k*0.25),new THREE.Vector3(49.8,0.68,zc-0.1+k*0.35),end]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(path,24,0.025,7,false),new THREE.MeshStandardMaterial({color:wireColors[k],roughness:0.55})));
    }
  });
  // Bancos de ensayo con motor, fuente regulable, borneras y ruedas de trabajo.
  for(const zc of [5.6,15.1]) {
    B.add(M.darkMetal,53.2,0.92,zc,2.65,0.14,1.22);
    for(const dx of [-1.12,1.12]) for(const dz of [-0.46,0.46]) B.add(M.darkMetal,53.2+dx,0.48,zc+dz,0.085,0.88,0.085);
    B.add(M.white,52.55,1.2,zc-0.18,0.82,0.42,0.55);
    B.add(M.darkMetal,52.55,1.44,zc-0.18,0.68,0.035,0.43);
    for(let k=0;k<4;k++) B.add(socketMats[k],52.3+k*0.16,1.46,zc+0.06,0.065,0.04,0.065);
    const motorMat=new THREE.MeshStandardMaterial({color:0xb54335,roughness:0.42,metalness:0.18});
    const motor=mesh(new THREE.CylinderGeometry(0.38,0.38,0.82,24),motorMat,54.0,1.35,zc+0.14);
    motor.rotation.x=Math.PI/2; g.add(motor);
    g.add(mesh(new THREE.CylinderGeometry(0.22,0.22,0.12,20),M.steel,54.0,1.35,zc+0.63));
    B.add(M.darkMetal,53.62,1.81,zc+0.14,0.22,0.2,0.32); // caja de bornes del motor
    for(let k=0;k<7;k++) B.add(M.steel,54.0,1.35,zc-0.3+k*0.14,0.7,0.035,0.035); // aletas de carcasa
    const loop=new THREE.CatmullRomCurve3([
      new THREE.Vector3(52.9,1.48,zc-0.1),new THREE.Vector3(53.3,1.7,zc-0.24),
      new THREE.Vector3(53.7,1.72,zc+0.02),new THREE.Vector3(54.0,1.5,zc+0.32),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(loop,28,0.035,8,false),wireMat));
  }
  // Seccionador rojo, gabinete de control y señalización de riesgo.
  B.add(M.darkMetal,49.1,1.38,16.9,1.35,2.55,0.64);
  B.add(M.green,49.1,2.05,16.57,0.9,0.52,0.05);
  B.add(M.white,49.1,1.22,16.56,0.85,0.08,0.045);
  const switchArm=mesh(new THREE.BoxGeometry(0.12,1.8,0.12),new THREE.MeshStandardMaterial({color:0xb3302d,roughness:0.48}),51.0,2.4,13.7);
  switchArm.rotation.z=-0.5; g.add(switchArm);
  const warning=new THREE.Mesh(new THREE.PlaneGeometry(2.7,0.76),new THREE.MeshBasicMaterial({map:textTex('⚡ ALTA TENSIÓN',{color:'#171717',bg:'#f2c744',font:'700 54px Arial',spacing:1})}));
  warning.position.set(53,2.5,18.58); g.add(warning); warning.material.side=THREE.DoubleSide;
  const labSign=new THREE.Mesh(new THREE.PlaneGeometry(6.6,0.62),new THREE.MeshBasicMaterial({map:textTex('LABORATORIO DE ALTA TENSIÓN',{color:'#eaf0f4',bg:'#1d3447',font:'700 48px Arial',spacing:1})}));
  labSign.position.set(40.5,3.38,20.82); g.add(labSign); labSign.material.side=THREE.DoubleSide;

  // Siluetas de estudiantes con casco para dar escala al laboratorio.
  const person=(x,z,shirt) => {
    const uniform=new THREE.MeshStandardMaterial({color:shirt,roughness:0.88});
    g.add(mesh(new THREE.CapsuleGeometry(0.22,0.74,4,10),uniform,x,0.98,z));
    g.add(mesh(new THREE.SphereGeometry(0.17,16,12),new THREE.MeshStandardMaterial({color:0xc9946e,roughness:0.9}),x,1.55,z));
    g.add(mesh(new THREE.SphereGeometry(0.21,16,8),new THREE.MeshStandardMaterial({color:0xf0ece0,roughness:0.7}),x,1.72,z));
    for(const dx of [-0.3,0.3]) g.add(mesh(new THREE.CapsuleGeometry(0.07,0.48,3,8),uniform,x+dx,1.0,z));
  };
  person(49.5,15.7,0x263c58); person(56.2,15.5,0x263c58);
}

function buildBlockHInterior(parent) {
  const g = parent;
  const B = new Boxes();
  const floor = new THREE.MeshStandardMaterial({ color: 0xbcb9b0, roughness: 0.72, metalness: 0.04 });
  const classroomBoard = new THREE.MeshStandardMaterial({ color: 0x17262a, roughness: 0.88 });
  const screen = new THREE.MeshStandardMaterial({ color: 0x101c28, emissive: 0x0b1720, emissiveIntensity: 0.6, roughness: 0.3 });
  const desk = M.woodPlain;
  const chair = new THREE.MeshStandardMaterial({ color: 0x31485b, roughness: 0.76 });
  const clearGlass = new THREE.MeshPhysicalMaterial({ color:0xd9e8ec, roughness:0.1, metalness:0.02, transparent:true, opacity:0.24, transmission:0.25, thickness:0.035, side:THREE.DoubleSide, depthWrite:false });

  g.add(mesh(boxUV(58, 0.18, 22, 7), floor, 30, 0.05, 10));
  // Muros interiores y divisiones vidriadas de las aulas.
  B.add(M.white, 30, 3.7, -1.35, 58, 0.35, 0.35);
  for (const x of [13.4, 46.6]) {
    // Espacio interior continuo: aquí solo hay portales con puertas dobles,
    // sin tabiques opacos que partan el Bloque H en habitaciones separadas.
    for(const z of [8.5,10,11.5]) B.add(M.mullion,x,1.55,z,0.075,2.75,0.075);
    B.add(M.mullion,x,2.9,10,0.075,0.075,3.0);
    for(const z of [9.25,10.75]) {
      g.add(mesh(new THREE.BoxGeometry(0.055,2.7,1.5),clearGlass,x,1.55,z,{cast:false}));
      B.add(M.darkMetal,x+0.055,1.55,z+(z<10?0.58:-0.58),0.04,0.48,0.035);
    }
  }
  // Paños acristalados interiores en la fachada frontal.
  // La fachada exterior ya contiene los huecos y el vidrio; evitar un segundo muro interior opaco.

  // Gran aula posterior: pared de vidrio, puerta doble, proyector y pantalla.
  for (const [x,w] of [[20.2,12.4],[39.8,12.4]]) {
    g.add(mesh(new THREE.BoxGeometry(w,3.25,0.045),clearGlass,x,2.0,5.35,{cast:false}));
    B.add(M.darkMetal,x,3.62,5.35,w+0.12,0.12,0.09);
    B.add(M.darkMetal,x,0.35,5.35,w+0.12,0.12,0.09);
    for (let mull=x-w/2+2.5;mull<x+w/2;mull+=2.5) B.add(M.mullion,mull,2.0,5.31,0.055,3.15,0.07);
  }
  for (const x of [29.25,30.75]) {
    g.add(mesh(new THREE.BoxGeometry(1.38,2.7,0.045),clearGlass,x,1.68,5.35,{cast:false}));
    B.add(M.darkMetal,x,1.68,5.31,0.055,2.8,0.06);
    B.add(M.darkMetal,x+(x<30?0.52:-0.52),1.65,5.28,0.035,0.52,0.03);
  }
  B.add(M.darkMetal,30,3.43,5.31,3.25,0.12,0.1);
  const roomSign = new THREE.Mesh(new THREE.PlaneGeometry(5.0,0.46),new THREE.MeshBasicMaterial({map:textTex('AULA DE ELECTRICIDAD',{w:900,h:100,font:'700 38px Arial',color:'#f4f7f8',bg:'#173d64',spacing:0})}));
  roomSign.position.set(30,3.73,5.27); g.add(roomSign); roomSign.material.side=THREE.DoubleSide;

  // Aula 1: mesas, sillas, pizarra y pantalla de clase.
  g.add(mesh(new THREE.PlaneGeometry(5.2, 1.45), classroomBoard, 7.2, 2.65, -1.14));
  g.add(mesh(new THREE.PlaneGeometry(2.0, 1.15), screen, 10.9, 2.75, -1.12));
  B.add(M.darkMetal, 7.2, 1.84, -1.05, 5.5, 0.12, 0.12);
  for (const z of [6.0, 9.4, 12.8, 16.0]) for (const x of [4.5, 9.3]) {
    B.add(desk, x, 0.92, z, 2.0, 0.12, 0.86);
    for (const dx of [-0.78, 0.78]) for (const dz of [-0.29,0.29]) B.add(M.darkMetal, x+dx, 0.48, z+dz, 0.07, 0.84, 0.07);
    B.add(chair, x, 0.57, z+1.05, 0.62, 0.12, 0.62);
    B.add(chair, x, 0.94, z+1.31, 0.62, 0.72, 0.1);
  }
  B.add(desk, 7.1, 0.82, 3.5, 2.4, 0.12, 0.72);
  // Gran aula detrás del laboratorio: filas de pupitres, sillas, cascos y equipos.
  g.add(mesh(new THREE.PlaneGeometry(6.8,1.55),classroomBoard,30,2.72,-1.12));
  g.add(mesh(new THREE.PlaneGeometry(6.2,1.25),screen,30,2.76,-1.08));
  B.add(M.darkMetal,30,1.91,-1.0,7.1,0.12,0.12);
  B.add(M.white,30,3.55,-1.12,7.4,0.12,0.16);
  // Proyector montado al techo, con soporte y lente.
  B.add(M.darkMetal,30,3.75,2.25,0.12,0.55,0.12);
  B.add(M.darkMetal,30,3.48,2.25,0.72,0.18,0.52);
  g.add(mesh(new THREE.CylinderGeometry(0.11,0.11,0.08,20),M.glass,30,3.48,2.0));
  for (const z of [0.2,1.5,2.8,4.1]) for (const x of [17,23.5,30,36.5,43]) {
    B.add(desk,x,0.94,z,2.65,0.14,0.82);
    for (const dx of [-1.05,1.05]) for (const dz of [-0.29,0.29]) B.add(M.darkMetal,x+dx,0.49,z+dz,0.065,0.88,0.065);
    for (const dx of [-0.58,0.58]) {
      B.add(chair,x+dx,0.57,z+0.78,0.5,0.12,0.48);
      B.add(chair,x+dx,0.91,z+0.99,0.5,0.66,0.09);
    }
    B.add(M.darkMetal,x,1.04,z,0.46,0.05,0.31); // multímetro sobre cada mesa
    B.add(M.green,x-0.68,1.03,z-0.03,0.09,0.09,0.09);
    B.add(M.red,x+0.68,1.03,z-0.03,0.09,0.09,0.09);
    if ((Math.round(x+z*10)%3)!==1) {
      const shell=new THREE.Mesh(new THREE.SphereGeometry(0.17,18,12,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:0xf2f0e9,roughness:0.62}));
      shell.position.set(x-0.75,1.13,z+0.03); g.add(shell);
      const brim=mesh(new THREE.TorusGeometry(0.16,0.025,8,24),M.white,x-0.75,1.12,z+0.03);
      brim.rotation.x=Math.PI/2; g.add(brim);
    }
  }
  // Dos armarios técnicos y un instructor al frente del aula.
  B.add(M.white,15.0,1.45,1.8,0.55,2.8,1.15);
  B.add(M.white,45.0,1.45,1.8,0.55,2.8,1.15);
  B.add(M.woodPlain,30,0.94,-0.7,1.25,1.65,0.72); // atril del docente
  B.add(M.darkMetal,30,1.85,-0.7,0.82,0.08,0.52);
  B.add(M.darkMetal,30,3.36,2.25,0.88,0.08,0.66); // soporte del proyector
  const slide = new THREE.Mesh(new THREE.PlaneGeometry(5.75,1.08),new THREE.MeshBasicMaterial({map:textTex('SISTEMAS ELÉCTRICOS  ·  CIRCUITOS  ·  MEDICIONES',{w:960,h:180,font:'700 48px Arial',color:'#eaf3fa',bg:'#123254'}),side:THREE.DoubleSide}));
  slide.position.set(30,2.73,-1.045); g.add(slide);
  // Recinto de alta tensión con malla, barras, transformador y aisladores.
  addHighVoltageBay(g,B);
  // Prototipo eléctrico expuesto directamente sobre el piso, sin tarima elevada.
  buildElectricPrototype(g, 30, 10.1);

  // Vigas vistas y luminarias lineales de taller/aula.
  for (const x of [5,18,30,42,55]) {
    const highBay=x===55, beamY=highBay?6.12:3.9;
    B.add(M.darkMetal, x, beamY, 10, 0.16, 0.16, 21);
    for (const z of [4,10,16]) {
      B.add(M.white, x, highBay?5.92:3.72, z, 3.8, 0.08, 0.34);
      const light = new THREE.PointLight(0xffecd0, 2.2, 13, 2);
      light.position.set(x,highBay?5.7:3.48,z); g.add(light);
    }
  }
  B.build(g);
}

// ------------------------------------------------------------------
// Árboles low-poly
// ------------------------------------------------------------------
function colorize(g, fn) {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [r, gg, b] = fn(p.getX(i), p.getY(i), p.getZ(i));
    c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const h3 = (x, y, z) => { const n = Math.sin(x * 12.99 + y * 78.23 + z * 37.72) * 43758.5; return n - Math.floor(n); };
function broadleafGeo() {
  const parts = [];
  // Tronco y ramas visibles bajo la copa: evita que los árboles parezcan
  // únicamente una colección de bolas verdes desde la cámara del campus.
  const trunk = new THREE.CylinderGeometry(0.2, 0.38, 4.2, 10, 3).toNonIndexed();
  trunk.translate(0, 2.1, 0);
  parts.push(colorize(trunk, (x,y,z) => {
    const grain=h3(x*18,y*4,z*18)*0.055;
    return [0.25+grain,0.16+grain*0.78,0.105+grain*0.55];
  }));
  // Raíces superficiales que ensanchan el arranque del tronco como en árboles maduros.
  for(let i=0;i<7;i++) {
    const a=i*Math.PI*2/7, dx=Math.cos(a)*0.9, dz=Math.sin(a)*0.9;
    const start=new THREE.Vector3(0,0.34,0), end=new THREE.Vector3(dx,0.055,dz), axis=end.clone().sub(start);
    const root=new THREE.CylinderGeometry(0.025,0.19,axis.length(),7,1);
    root.translate(0,axis.length()/2,0);
    root.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis.clone().normalize())));
    root.translate(start.x,start.y,start.z);
    parts.push(colorize(root.toNonIndexed(),()=>[0.26,0.17,0.11]));
  }
  const branches = [
    [0.85, 2.7, 0, 0.9, 1.3, 0.2], [-0.8, 2.9, 0.15, -0.8, 1.2, 0.1],
    [0.1, 3.15, 0.75, 0.1, 1.0, 0.7], [0.05, 3.35, -0.75, 0.1, 0.9, -0.7],
    [-0.1, 3.2, 0.1, -0.15, 1.25, -0.1],
  ];
  for (const [x, y, z, dx, dy, dz] of branches) {
    const a = new THREE.Vector3(x, y, z), b = new THREE.Vector3(x + dx, y + dy, z + dz);
    const axis = b.clone().sub(a);
    const branch = new THREE.CylinderGeometry(0.055, 0.13, axis.length(), 6, 1);
    branch.translate(0, axis.length() / 2, 0);
    const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
    branch.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(align));
    branch.translate(a.x, a.y, a.z);
    parts.push(colorize(branch.toNonIndexed(), () => [0.30, 0.22, 0.16]));
  }
  // Copas en masas irregulares con sombreado suave y variación de hojas.
  // La geometría se comparte entre instancias para mantener el coste acotado.
  const crown = [
    [0, 5.5, 0, 1.65, 1.65, 1.5], [1.15, 4.65, 0.25, 1.25, 1.35, 1.2],
    [-1.15, 4.65, -0.2, 1.3, 1.4, 1.25], [0.1, 4.55, 1.05, 1.2, 1.25, 1.1],
    [0, 4.5, -1.05, 1.18, 1.3, 1.12], [0.15, 6.35, 0.15, 1.35, 1.4, 1.25],
    [1.15, 5.8, -0.55, 1.05, 1.2, 1.05], [-0.95, 5.85, 0.7, 1.1, 1.2, 1.05],
    [-0.2, 5.0, -1.7, 0.95, 1.0, 0.9], [0.3, 5.0, 1.75, 0.92, 1.0, 0.9],
  ];
  for (const [x, y, z, sx, sy, sz] of crown) {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + (h3(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z) - 0.5) * 0.18;
      p.setXYZ(i, p.getX(i) * sx * k, p.getY(i) * sy * k, p.getZ(i) * sz * k);
    }
    g.computeVertexNormals();
    g.translate(x, y, z);
    parts.push(colorize(g.toNonIndexed(), (px, py, pz) => {
      const t = smooth(3.5, 7.4, py), n = h3(px * 1.7, py * 1.2, pz * 1.7) * 0.12;
      return [0.075 + 0.105 * t + n * 0.55, 0.19 + 0.19 * t + n * 0.75, 0.045 + 0.045 * t + n * 0.25];
    }));
  }
  return mergeGeometries(parts, false);
}
function coniferGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.14, 0.24, 2, 6).toNonIndexed();
  trunk.translate(0, 1, 0);
  parts.push(colorize(trunk, () => [0.3, 0.21, 0.15]));
  [[2.0, 3.2, 2.6], [1.6, 2.8, 4.4], [1.15, 2.6, 6.0], [0.7, 2.2, 7.4]].forEach(([r, h, y]) => {
    const g = new THREE.ConeGeometry(r, h, 8).toNonIndexed();
    g.translate(0, y, 0);
    parts.push(colorize(g, (px, py) => {
      const t = smooth(1.5, 8.5, py);
      return [0.06 + 0.05 * t, 0.17 + 0.11 * t, 0.10 + 0.04 * t];
    }));
  });
  return mergeGeometries(parts);
}
function palmGeo() {
  const parts=[];
  // Tronco ligeramente curvo, con anillos de crecimiento propios de una palmera.
  for(let i=0;i<7;i++) {
    const y=i*0.72, lean=0.0045*i*i;
    const seg=new THREE.CylinderGeometry(0.19-i*0.012,0.23-i*0.009,0.78,10,1).toNonIndexed();
    seg.translate(lean,y+0.39,0);
    parts.push(colorize(seg,(x,py,z)=>{
      const grain=0.5+0.5*Math.sin((py*19+x*7+z*5)*Math.PI);
      return [0.34+grain*0.1,0.22+grain*0.07,0.12+grain*0.035];
    }));
    const ring=new THREE.TorusGeometry(0.205-i*0.012,0.018,5,14).toNonIndexed();
    ring.rotateX(Math.PI/2); ring.translate(lean,y+0.76,0);
    parts.push(colorize(ring,()=>[0.2,0.13,0.075]));
  }
  // Frondas largas con nervio central y foliolos estrechos a ambos lados.
  for(let f=0;f<11;f++) {
    const a=f*Math.PI*2/11, dx=Math.cos(a), dz=Math.sin(a);
    const sideX=-dz, sideZ=dx;
    const points=[];
    for(let k=0;k<=8;k++) {
      const t=k/8;
      points.push(new THREE.Vector3(dx*2.85*t+0.0045*49,5.05-0.95*t-0.72*t*t,dz*2.85*t));
    }
    const rachis=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),18,0.035,6,false).toNonIndexed();
    parts.push(colorize(rachis,()=>[0.29,0.34,0.12]));
    for(let k=1;k<=12;k++) {
      const t=k/14, len=(1-t)*1.02+0.12;
      for(const sign of [-1,1]) {
        const bx=dx*2.85*t+0.0045*49, by=5.05-0.95*t-0.72*t*t, bz=dz*2.85*t;
        const ex=bx+sideX*sign*len+dx*0.18, ey=by-0.16-len*0.43, ez=bz+sideZ*sign*len+dz*0.18;
        const width=len*0.095;
        const verts=[bx,by,bz,bx+sideX*sign*width,by-0.06,bz+sideZ*sign*width,ex,ey,ez,
          bx,by,bz,ex,ey,ez,bx-sideX*sign*width,by-0.06,bz-sideZ*sign*width];
        const leaf=new THREE.BufferGeometry();
        leaf.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
        leaf.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,0.5,0.35,1,1,0,0,1,1,0.5,0.35],2));
        leaf.computeVertexNormals();
        parts.push(colorize(leaf,(x,y,z)=>{
          const light=0.5+0.5*Math.sin(x*8+y*3+z*7);
          return [0.075+0.035*light,0.25+0.12*light,0.085+0.04*light];
        }));
      }
    }
  }
  return mergeGeometries(parts,false);
}

// ------------------------------------------------------------------
export function buildCampus(scene) {
  const g = new THREE.Group();
  scene.add(g);
  const B = new Boxes();
  const treeInstances = [];
  const plazaJets = [], plazaDrops = [], plazaRipples = [];

  // ============ suelos ============
  const slab = (x0, x1, z0, z1, y, mat, s = 4) =>
    g.add(mesh(boxUV(x1 - x0, 0.1, z1 - z0, s), mat, (x0 + x1) / 2, y - 0.05, (z0 + z1) / 2, { cast: false }));
  slab(-53, 34, -30, -1, 0.1, M.concrete, 6);         // plataforma edificios
  slab(-53, -30, -1, 20, 0.1, M.concrete, 6);
  slab(-30, 42, -1, 42, 0.12, M.paver, 4);            // plaza
  slab(-8, -2, 42, 64, 0.12, M.paver, 4);             // sendero
  slab(-130, 130, 64, 66.6, 0.14, M.concrete, 5);     // acera
  slab(42, 90, 22, 58, 0.08, M.asphalt, 8);           // parqueadero
  slab(62, 70, 58, 67.2, 0.08, M.asphalt, 8);
  slab(-720, 720, 67, 77, 0.06, M.asphalt, 8);        // vía
  slab(-130, 130, 77.3, 81.2, 0.14, M.concrete, 5);   // acera opuesta
  slab(41, 68, -32, -5, 0.09, M.roof, 5);             // patio de energía
  // líneas de la vía y del parqueadero
  for (let x = -700; x < 700; x += 9) B.add(M.paint, x, 0.07, 72, 3.6, 0.02, 0.16);
  for (const z of [67.5, 76.5]) B.add(M.paint, 0, 0.07, z, 1440, 0.02, 0.14);
  for (const zr of [30, 50]) for (let i = 0; i <= 15; i++) B.add(M.paint, 44.05 + 2.7 * i, 0.09, zr, 0.12, 0.02, 5.6);
  // Bordillos, juntas de losas y drenaje pluvial para dar escala a la calle.
  for (const z of [66.82, 77.08]) B.add(M.concrete, 0, 0.18, z, 260, 0.24, 0.28);
  for (let x = -126; x <= 126; x += 3.2) {
    B.add(M.darkConcrete, x, 0.194, 65.3, 0.035, 0.008, 2.5);
    B.add(M.darkConcrete, x, 0.194, 79.25, 0.035, 0.008, 3.5);
  }
  // Paso peatonal alineado con el sendero que baja desde la plaza.
  for (let i = 0; i < 8; i++) B.add(M.paint, -8.4 + i * 0.98, 0.105, 72, 0.52, 0.025, 7.1);
  B.add(M.paint, -9.2, 0.105, 72, 0.12, 0.025, 7.1);
  B.add(M.paint, 0.1, 0.105, 72, 0.12, 0.025, 7.1);
  // Rejillas pluviales junto al borde del pavimento.
  for (const x of [-92, -48, 40, 88]) {
    B.add(M.darkMetal, x, 0.085, 76.55, 1.6, 0.035, 0.38);
    for (let k = 0; k < 8; k++) B.add(M.steel, x - 0.68 + k * 0.195, 0.108, 76.55, 0.035, 0.018, 0.31);
  }
  // Cerramiento del campus hacia la calle: zócalo pétreo y reja negra,
  // dejando un acceso peatonal alineado al sendero y un portón vehicular.
  for (const [x0, x1] of [[-126,-12],[2,40],[61,126]]) {
    const mid = (x0 + x1) / 2, len = x1 - x0;
    B.add(M.darkConcrete, mid, 0.68, 62.65, len, 1.25, 0.5);
    B.add(M.concrete, mid, 1.34, 62.65, len + 0.12, 0.12, 0.62);
    B.add(M.darkMetal, mid, 1.52, 62.65, len, 0.12, 0.12);
    B.add(M.darkMetal, mid, 2.38, 62.65, len, 0.12, 0.12);
    for (let x = x0; x <= x1; x += 6) {
      B.add(M.darkConcrete, x, 1.28, 62.65, 0.38, 2.55, 0.62);
    }
    for (let x = x0 + 0.75; x < x1; x += 0.75) {
      if (Math.abs(x - x0) < 0.5 || Math.abs(x - x1) < 0.5) continue;
      B.add(M.darkMetal, x, 1.95, 62.65, 0.055, 0.82, 0.07);
    }
  }
  for (const x of [-12, 2, 40, 61]) {
    B.add(M.darkConcrete, x, 1.48, 62.65, 0.72, 2.95, 0.78);
    B.add(M.concrete, x, 2.98, 62.65, 0.94, 0.16, 1.0);
    B.add(M.lamp, x, 3.1, 62.65, 0.28, 0.12, 0.32);
  }

  // ============ Bloque A (barra principal) ============
  const barHoles = [
    { x0: -15, x1: 3, z0: -12, z1: 0, y: 22 },
    { x0: -51, x1: -31.5, z0: -28, z1: 18, y: 12 },
    { x0: 26, x1: 34, z0: -9.5, z1: 2, y: 4.6 },
  ];
  block(B, g, {
    cx: 0, cz: -18, w: 64, d: 18, floors: 4, fh: 4, bay: 4, pier: 0.2, style: 'frame',
    sill: 1.0, winH: 2.5, sill0: 0.45, winH0: 3.05, wallMat: M.white, holes: barHoles,
  });
  // Dos paños gráficos de gran formato inspirados en el mural del acceso del Bloque A.
  for (const [x, variant] of [[-21.5,0],[9.5,1]]) {
    B.add(M.darkMetal, x, 8.0, -8.82, 10.9, 14.0, 0.18);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(10.55, 13.7), new THREE.MeshStandardMaterial({ map: muralTex(variant), roughness: 0.88 }));
    art.position.set(x, 8.0, -8.705);
    g.add(art);
  }
  // Rótulo institucional en la línea de cubierta del edificio principal.
  // La torre acristalada del atrio quedaba delante del rótulo, dejándolo
  // atrapado dentro del edificio; ahora la placa va en la cara exterior.
  B.add(M.white, 0, 15.6, 0.04, 24, 1.05, 0.3);
  const upsSign = new THREE.Mesh(new THREE.PlaneGeometry(21.5, 0.78), new THREE.MeshBasicMaterial({ map: textTex('UNIVERSIDAD POLITÉCNICA SALESIANA', { color: '#25282b', font: '700 74px "Segoe UI", Arial, sans-serif', spacing: 3 }), transparent: true, depthWrite: false }));
  upsSign.position.set(0, 15.63, 0.22); g.add(upsSign);
  // parasoles horizontales en la fachada sur
  for (let f = 0; f < 4; f++) {
    const y = f * 4 + (f === 0 ? 3.62 : 3.62);
    B.add(M.mullion, -23.5, y, -8.25, 17, 0.07, 1.1);
    B.add(M.mullion, 17.5, y, -8.25, 29, 0.07, 1.1);
  }
  // equipos en cubierta
  g.add(mesh(boxUV(6, 3.2, 5, 3), M.concrete, 27, 17.9, -23.5));
  B.add(M.white, 27, 19.6, -23.5, 6.5, 0.2, 5.5);
  for (const z of [-17, -12.6]) {
    B.add(M.steel, 27.5, 17.5, z, 3.4, 1.9, 2.4);
    B.add(M.darkMetal, 27.5, 18.5, z, 2.6, 0.12, 1.8);
  }

  // ============ Bloque B (ala de ladrillo) ============
  block(B, g, {
    cx: -41, cz: -5, w: 18, d: 44, floors: 3, fh: 4, bay: 3.66, pier: 1.55, style: 'brick',
    sill: 1.05, winH: 2.15, wallMat: M.brick,
    holes: [{ x0: -32.6, x1: 33, z0: -28, z1: -9, y: 16 }],
  });
  // acceso secundario del ala
  B.add(M.white, -30.6, 3.3, 8.5, 3.2, 0.2, 5);
  B.add(M.darkMetal, -31.8, 1.5, 8.5, 0.25, 3, 3.2);

  // ============ Torre atrio (acceso principal) ============
  const TX = -6, TZ = -6, TW = 18, TD = 10, TH = 22;
  const atrium = mesh(new THREE.BoxGeometry(TW, TH, TD), M.atrium, TX, TH / 2, TZ, { cast: false, receive: false });
  atrium.renderOrder = 5;
  g.add(atrium);
  // Núcleo vertical de vidrio oscuro característico de la entrada principal.
  B.add(M.darkGlass, TX, 13.2, -0.87, 7.5, 15.7, 0.16);
  for (const x of [TX - 3.8, TX, TX + 3.8]) B.add(M.darkMetal, x, 13.2, -0.76, 0.09, 15.8, 0.08);
  for (let k = 1; k <= 4; k++) {
    const y = k * 4.4;
    B.add(M.white, TX, y, -5.1, TW - 0.5, 0.3, 7.6);
    for (const z of [-3.2, -6.6]) B.add(M.strip, TX, y - 0.18, z, 15.5, 0.05, 0.35);
    B.add(M.mullion, TX, y + 1.05, -1.5, TW - 0.8, 0.06, 0.06); // barandal
  }
  B.add(M.white, TX, TH + 0.15, TZ, TW + 2.6, 0.3, TD + 2.6);
  B.add(M.roofPlain, TX, TH + 0.33, TZ, TW + 1.8, 0.06, TD + 1.8);
  for (const x of [-14.72, -9.6, -2.4, 2.72]) B.add(M.white, x, TH / 2, -1.28, 0.5, TH, 0.5);
  for (const x of [-14.72, 2.72]) B.add(M.white, x, TH / 2, -8.7, 0.5, TH, 0.5);
  B.add(M.wood, -12.2, 10.5, -6.6, 3.4, 21, 3.6); // núcleo de escaleras
  for (let x = -15; x <= 3.01; x += 1.5) B.add(M.mullion, x, TH / 2, -0.97, 0.07, TH, 0.12);
  for (let y = 2.2; y < TH; y += 2.2) {
    B.add(M.mullion, TX, y, -0.97, TW, 0.07, 0.12);
    B.add(M.mullion, 3.03, y, -5, 0.12, 0.07, 8);
    B.add(M.mullion, -15.03, y, -5, 0.12, 0.07, 8);
  }
  for (let z = -9; z <= -0.9; z += 1.6) {
    B.add(M.mullion, 3.03, TH / 2, z, 0.12, TH, 0.07);
    B.add(M.mullion, -15.03, TH / 2, z, 0.12, TH, 0.07);
  }
  // puertas y marquesina
  B.add(M.darkMetal, TX, 1.6, -0.9, 6.2, 3.2, 0.22);
  B.add(M.glassLit[0], TX - 1.5, 1.5, -0.8, 2.6, 2.8, 0.1);
  B.add(M.glassLit[0], TX + 1.5, 1.5, -0.8, 2.6, 2.8, 0.1);
  B.add(M.white, TX, 4.1, 2.3, 10, 0.26, 6.6);
  B.add(M.wood, TX, 3.95, 2.3, 9.6, 0.06, 6.2);
  for (const x of [-10.4, -1.6]) B.add(M.darkMetal, x, 2, 5.1, 0.2, 4, 0.2);
  const signMat = new THREE.MeshBasicMaterial({ map: textTex('BLOQUE A'), transparent: true, depthWrite: false });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 0.8), signMat);
  sign.position.set(TX, 5.1, 5.63);
  g.add(sign);
  B.add(M.darkMetal, TX, 5.1, 5.5, 7.0, 1.05, 0.2);
  // Escalones bajos y laterales de piedra para entrar desde la plaza.
  for (let i = 0; i < 4; i++) {
    const h = 0.12 + i * 0.12;
    B.add(M.concrete, TX, 0.08 + h/2, 7.2 - i*0.42, 10.2, h, 0.46);
  }

  // ============ Bloque H de Electricidad ============
  const { shell: hShell, roof: hRoof, interior: hInterior, lights: hLights, animateFountain } = buildBlockH(g);
  // conector acristalado con el bloque A
  B.add(M.glass, 30, 2.2, -4.2, 7.6, 3.6, 9.4);
  B.add(M.white, 30, 4.3, -4.2, 8.6, 0.3, 10);
  B.add(M.darkConcrete, 30, 0.25, -4.2, 8, 0.5, 9.6);
  for (const x of [26.2, 33.8]) for (let z = -8; z <= 0; z += 2) B.add(M.mullion, x, 2.2, z, 0.1, 3.8, 0.08);

  // ============ plaza: jardineras, espejo de agua, bancas ============
  // Mantener las jardineras fuera de la huella del Bloque H.
  const islands = [[-28, -18, 6, 38]];
  for (const [x0, x1, z0, z1] of islands) {
    B.add(M.concrete, (x0 + x1) / 2, 0.24, (z0 + z1) / 2, x1 - x0, 0.42, z1 - z0);
    B.add(M.lawn, (x0 + x1) / 2, 0.28, (z0 + z1) / 2, x1 - x0 - 0.7, 0.42, z1 - z0 - 0.7);
  }
  const PX = -5, PZ = 22;
  g.add(mesh(new THREE.CylinderGeometry(6, 6.1, 0.55, 64), M.concrete, PX, 0.3, PZ));
  const water = mesh(new THREE.CircleGeometry(5.55, 64), M.water, PX, 0.59, PZ, { cast: false });
  water.rotation.x = -Math.PI / 2;
  g.add(water);
  g.add(mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.9, 24), M.concrete, PX, 0.6, PZ));
  const sculpt = mesh(new THREE.TorusKnotGeometry(0.9, 0.16, 120, 12, 2, 3), M.steel, PX, 2.4, PZ);
  g.add(sculpt);
  // Ocho surtidores rodean la escultura; el ciclo de gotas y ondas se anima
  // en update para que el agua también se vea desde la cámara aérea.
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4, x=PX+Math.cos(a)*2.55, z=PZ+Math.sin(a)*2.55;
    B.add(M.steel,x,0.64,z,0.22,0.09,0.22);
    const jetMat=new THREE.MeshBasicMaterial({color:0x8de8ff,transparent:true,opacity:0.82,depthWrite:false});
    const jet=mesh(new THREE.CylinderGeometry(0.045,0.075,1,10),jetMat,x,1.3,z,{cast:false});
    g.add(jet); plazaJets.push({mesh:jet,a,phase:i*0.63});
    const dropMat=new THREE.MeshBasicMaterial({color:0xc9f6ff,transparent:true,opacity:0.96,depthWrite:false});
    for(let k=0;k<2;k++) {
      const drop=mesh(new THREE.SphereGeometry(0.075,10,8),dropMat,x,0.7,z,{cast:false});
      g.add(drop); plazaDrops.push({mesh:drop,a,phase:i*0.31+k*0.5});
    }
    const rippleMat=new THREE.MeshBasicMaterial({color:0x87dfff,transparent:true,opacity:0.24,depthWrite:false,side:THREE.DoubleSide});
    const ripple=mesh(new THREE.TorusGeometry(0.28,0.018,6,24),rippleMat,PX+Math.cos(a)*3.55,0.608,PZ+Math.sin(a)*3.55,{cast:false});
    ripple.rotation.x=Math.PI/2; g.add(ripple); plazaRipples.push({mesh:ripple,phase:i*0.125});
  }
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * Math.PI * 2 + 0.52;
    const bx = PX + Math.cos(th) * 8.6, bz = PZ + Math.sin(th) * 8.6;
    B.add(M.woodPlain, bx, 0.58, bz, 0.6, 0.1, 2.3, -th);
    B.add(M.darkMetal, bx, 0.34, bz, 0.45, 0.42, 1.9, -th);
  }
  // astas
  const flags = [];
  [[9, 0x1f8f5f], [11.5, 0xf4f4f0], [14, 0x1d5fa8]].forEach(([x, c], i) => {
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 11, 8), M.steel, x, 5.5, 3.2));
    const fg = new THREE.PlaneGeometry(2.6, 1.6, 14, 6);
    fg.translate(1.3, 0, 0);
    const f = mesh(fg, new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.8 }), x + 0.06, 10, 3.2);
    f.userData.base = fg.attributes.position.array.slice();
    f.userData.ph = i * 1.7;
    flags.push(f);
    g.add(f);
  });

  // ============ luminarias ============
  const lampPos = [
    [-17.3, 8], [-17.3, 22], [-17.3, 36], [7.3, 8], [7.3, 36], [18, 24], [-29, 14], [-29, 30],
    [-10.5, 50], [0.5, 58], [-90, 65.3], [-60, 65.3], [-30, 65.3], [22, 65.3], [50, 65.3], [84, 65.3], [112, 65.3],
    [55, 40], [78, 40], [43, -3], [66.5, -18], [41.5, 30],
  ];
  const poolGeo = new THREE.PlaneGeometry(20, 20);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    map: glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    polygonOffset: true, polygonOffsetFactor: -4,
  });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, lampPos.length);
  const d0 = new THREE.Object3D();
  lampPos.forEach(([x, z], i) => {
    B.add(M.darkMetal, x, 2.7, z, 0.14, 5.4, 0.14);
    B.add(M.darkMetal, x + 0.45, 5.4, z, 1.2, 0.1, 0.32);
    B.add(M.lamp, x + 0.6, 5.33, z, 0.8, 0.05, 0.24);
    d0.position.set(x + 0.6, 0.2, z);
    d0.updateMatrix();
    pools.setMatrixAt(i, d0.matrix);
  });
  pools.renderOrder = 2;
  pools.userData.noPick = true;
  g.add(pools);
  const pts = [[TX, 3.4, 2.5, 20], [PX, 4, PZ - 9, 14], [20, 3.2, 9.8, 12]].map(([x, y, z, I]) => {
    const p = new THREE.PointLight(0xffc98a, 0, 34, 1.8);
    p.position.set(x, y, z);
    p.userData.I = I;
    g.add(p);
    return p;
  });

  // ============ autos ============
  {
    const body = new THREE.Shape();
    body.moveTo(-2.12,0.35); body.lineTo(1.9,0.35); body.quadraticCurveTo(2.18,0.38,2.17,0.67);
    body.quadraticCurveTo(2.13,0.82,1.82,0.88); body.lineTo(1.18,0.98); body.lineTo(-1.52,0.98);
    body.quadraticCurveTo(-1.82,0.98,-1.98,0.83); body.lineTo(-2.18,0.72); body.quadraticCurveTo(-2.27,0.52,-2.12,0.35);
    const cab = new THREE.Shape();
    cab.moveTo(-1.48,0.98); cab.lineTo(1.05,0.98); cab.lineTo(0.48,1.52);
    cab.quadraticCurveTo(0.36,1.61,0.16,1.61); cab.lineTo(-0.94,1.61);
    cab.quadraticCurveTo(-1.12,1.61,-1.22,1.48); cab.lineTo(-1.48,0.98);
    const ex = (s, depth) => {
      const e = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.055, bevelThickness: 0.045, bevelSegments: 3, curveSegments:8 });
      e.translate(0, 0, -depth / 2);
      return e;
    };
    const wheels = mergeGeometries([[1.35, 0.82], [1.35, -0.82], [-1.35, 0.82], [-1.35, -0.82]].map(([x, z]) => {
      const w = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14);
      w.rotateX(Math.PI / 2);
      w.translate(x, 0.34, z);
      return w;
    }));
    const rimParts=[];
    for(const [x,z] of [[1.35,0.82],[1.35,-0.82],[-1.35,0.82],[-1.35,-0.82]]) {
      for(const side of [-1,1]) {
        const ring=new THREE.TorusGeometry(0.235,0.035,8,24); ring.translate(x,0.34,z+side*0.14); rimParts.push(ring);
        const hub=new THREE.CylinderGeometry(0.065,0.065,0.055,16); hub.rotateX(Math.PI/2); hub.translate(x,0.34,z+side*0.16); rimParts.push(hub);
        for(let k=0;k<5;k++) {
          const a=k*Math.PI*2/5, spoke=new THREE.BoxGeometry(0.19,0.035,0.035);
          spoke.rotateZ(a); spoke.translate(x+Math.cos(a)*0.105,0.34+Math.sin(a)*0.105,z+side*0.16); rimParts.push(spoke);
        }
      }
    }
    const rims=mergeGeometries(rimParts);
    const roofGeo=new THREE.BoxGeometry(1.62,0.11,1.48); roofGeo.translate(-0.42,1.56,0);
    const trimParts=[];
    for(const side of [-1,1]) {
      for(const px of [-1.35,-0.28,0.48]) {
        const pillar=new THREE.BoxGeometry(0.065,0.56,0.055); pillar.translate(px,1.26,side*0.735); trimParts.push(pillar);
      }
      const mirror=new THREE.BoxGeometry(0.16,0.09,0.16); mirror.translate(0.83,1.05,side*0.88); trimParts.push(mirror);
      const handle=new THREE.BoxGeometry(0.25,0.035,0.035); handle.translate(-0.18,0.84,side*0.805); trimParts.push(handle);
    }
    for(const x of [-2.12,2.12]) {
      const bumper=new THREE.BoxGeometry(0.15,0.17,1.42); bumper.translate(x,0.47,0); trimParts.push(bumper);
    }
    const trim=mergeGeometries(trimParts);
    const frontLightParts=[], rearLightParts=[];
    for(const side of [-1,1]) {
      const head=new THREE.BoxGeometry(0.12,0.15,0.28); head.translate(2.02,0.75,side*0.49); frontLightParts.push(head);
      const tail=new THREE.BoxGeometry(0.1,0.16,0.25); tail.translate(-2.02,0.71,side*0.49); rearLightParts.push(tail);
    }
    const frontLamps=mergeGeometries(frontLightParts), rearLamps=mergeGeometries(rearLightParts);
    const seatParts=[];
    for(const side of [-1,1]) {
      const cushion=new THREE.BoxGeometry(0.52,0.17,0.43); cushion.translate(-0.48,0.91,side*0.36); seatParts.push(cushion);
      const back=new THREE.BoxGeometry(0.16,0.5,0.43); back.translate(-0.69,1.2,side*0.36); seatParts.push(back);
      const headrest=new THREE.BoxGeometry(0.14,0.15,0.32); headrest.translate(-0.69,1.52,side*0.36); seatParts.push(headrest);
    }
    const dash=new THREE.BoxGeometry(0.2,0.18,1.25); dash.translate(0.76,1.06,0); seatParts.push(dash);
    const steering=new THREE.TorusGeometry(0.15,0.018,8,20); steering.rotateY(Math.PI/2); steering.translate(0.56,1.24,-0.36); seatParts.push(steering);
    const steeringHub=new THREE.CylinderGeometry(0.045,0.045,0.055,12); steeringHub.rotateZ(Math.PI/2); steeringHub.translate(0.56,1.24,-0.36); seatParts.push(steeringHub);
    const seats=mergeGeometries(seatParts);
    const slots = [];
    for (const zr of [30, 50]) for (let i = 0; i < 15; i++) if (rnd() < 0.72) slots.push([45.4 + 2.7 * i, zr]);
    const palette = [0xe8e8e8, 0x2b2f36, 0x9aa3ab, 0xb3261e, 0x1f4e8c, 0xf2f2f2, 0x3d6b4f, 0x6b7078, 0xd9a521];
    const bodyMat = new THREE.MeshPhysicalMaterial({ color:0xffffff,roughness:0.3,metalness:0.18,clearcoat:0.82,clearcoatRoughness:0.22 });
    const carGlass=new THREE.MeshPhysicalMaterial({color:0x8fb9c8,roughness:0.12,metalness:0.02,transparent:true,opacity:0.42,transmission:0.28,thickness:0.025,side:THREE.DoubleSide,depthWrite:false});
    const silver=new THREE.MeshStandardMaterial({color:0xb8c3c8,roughness:0.28,metalness:0.78});
    const trimMat=new THREE.MeshStandardMaterial({color:0x18222a,roughness:0.54,metalness:0.22});
    const seatMat=new THREE.MeshStandardMaterial({color:0x27323b,roughness:0.86});
    const lampFront=new THREE.MeshStandardMaterial({color:0xfff1ce,emissive:0x57421a,roughness:0.24});
    const lampRear=new THREE.MeshStandardMaterial({color:0xc82f28,emissive:0x50100c,roughness:0.28});
    const mB = new THREE.InstancedMesh(ex(body, 1.62), bodyMat, slots.length);
    const mC = new THREE.InstancedMesh(ex(cab, 1.44), carGlass, slots.length);
    const mW = new THREE.InstancedMesh(wheels, M.rubber, slots.length);
    const mR = new THREE.InstancedMesh(rims,silver,slots.length);
    const mRoof = new THREE.InstancedMesh(roofGeo,bodyMat,slots.length);
    const mTrim = new THREE.InstancedMesh(trim,trimMat,slots.length);
    const mSeats = new THREE.InstancedMesh(seats,seatMat,slots.length);
    const mFront = new THREE.InstancedMesh(frontLamps,lampFront,slots.length);
    const mRear = new THREE.InstancedMesh(rearLamps,lampRear,slots.length);
    const c = new THREE.Color();
    slots.forEach(([x, z], i) => {
      d0.position.set(x, 0.08, z + R(-0.25, 0.25));
      d0.rotation.set(0, Math.PI / 2, 0);
      const scale=R(0.94,1.06); d0.scale.set(scale,scale,scale);
      d0.updateMatrix();
      for (const m of [mB,mC,mW,mR,mRoof,mTrim,mSeats,mFront,mRear]) m.setMatrixAt(i,d0.matrix);
      const paint=c.setHex(palette[Math.floor(rnd()*palette.length)]);
      mB.setColorAt(i,paint); mRoof.setColorAt(i,paint);
    });
    d0.rotation.set(0, 0, 0);
    for (const m of [mB,mC,mW,mR,mRoof,mTrim,mSeats,mFront,mRear]) { m.castShadow=true; m.receiveShadow=true; m.userData.noPick=true; g.add(m); }
  }

  // ============ árboles ============
  {
    const zones = [[-54, 43, -31, 43], [40, 93, -34, 60], [-10, 0, 42, 66], [-9999, 9999, 62.5, 80.5], [92, 114, -27, -8]];
    const inZone = (x, z) => zones.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
    const list = [[], [], []];
    const push = (type, x, z, s, y) => list[type].push([x, y ?? terrainH(x, z), z, s, rnd() * 6.28, 0.82 + rnd() * 0.36]);
    // diseñados: jardineras, alineación de la acera
    for (let z = 10; z <= 34; z += 6) push(0, -23, z, 1.05, 0.48);
    // Mantener despejado el eje visual desde el patio hacia la entrada y los ventanales del H.
    for (let x = -124; x <= 124; x += 15.5) if (Math.abs(x + 5) > 8 && !(x > 56 && x < 76)) push(0, x, 61, 0.95);
    // dispersos
    let tries = 0;
    while (list.reduce((sum, trees) => sum + trees.length, 0) < 430 && tries++ < 6000) {
      const x = R(-380, 380), z = R(-340, 300);
      if (inZone(x, z)) continue;
      const h = terrainH(x, z);
      const dens = fbm(x * 0.018 + 50, z * 0.018 + 20, 3);
      if (dens < (h < 0.5 ? 0.6 : 0.5)) continue;
      if (TURBINES.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 10)) continue;
      if (PYLONS.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 9)) continue;
      if (WIND_ROUTES.some((r) => distToPolyline(x, z, r) < 4)) continue;
      const species=rnd();
      const type=h>4 ? (species<0.34?0:species<0.75?1:2) : (species<0.69?0:species<0.88?1:2);
      push(type,x,z,R(type===2?0.78:0.8,type===2?1.3:1.55),h-0.1);
    }
    const tm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, envMapIntensity: 0.45, side:THREE.DoubleSide });
    const col = new THREE.Color();
    [broadleafGeo(), coniferGeo(), palmGeo()].forEach((geo, t) => {
      const im = new THREE.InstancedMesh(geo, tm, list[t].length);
      list[t].forEach(([x, y, z, s, ry, tint], i) => {
        d0.position.set(x, y, z);
        d0.rotation.set(0, ry, 0);
        const width=0.84+h3(x,z,t)*0.32;
        d0.scale.set(s*width,s*(0.9+0.25*tint),s*(1.68-width));
        d0.updateMatrix();
        im.setMatrixAt(i, d0.matrix);
        im.setColorAt(i, col.setRGB(tint, 0.9 + tint * 0.12, tint * 0.95));
      });
      im.castShadow = true; im.receiveShadow = true;
      im.userData.noPick = true;
      g.add(im);
      treeInstances.push({mesh:im,records:list[t],species:t});
    });
    d0.rotation.set(0, 0, 0); d0.scale.setScalar(1);
  }

  // ============ personas ============
  const segs = [
    [-6, 6.5, -6, 15], [-14, 28, 3, 40], [-5, 43, -5, 63.5], [-110, 65.3, 110, 65.3], [-100, 65.6, 60, 65.6],
    [-29, 3, -29, 40], [-15, 11, 5, 11], [18, 23, 41, 23], [-16, 3, 6, 3], [4, 30, 4, 41], [19, 2, 19, 20],
  ];
  const people = [];
  for (let i = 0; i < 46; i++) {
    const s = segs[Math.floor(rnd() * segs.length)];
    const L = Math.hypot(s[2] - s[0], s[3] - s[1]);
    people.push({ s, L, sp: R(0.9, 1.5), ph: rnd() * L * 2, off: R(-0.9, 0.9), late: rnd() < 0.25, h: R(0.92, 1.08) });
  }
  const pg = mergeGeometries([
    new THREE.CapsuleGeometry(0.2, 0.95, 4, 10).translate(0, 0.72, 0),
    new THREE.SphereGeometry(0.15, 10, 8).translate(0, 1.55, 0),
  ]);
  const pMesh = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ roughness: 0.85 }), people.length);
  const pc = new THREE.Color();
  const cloth = [0x2f4b7c, 0xa83232, 0xe0e0e0, 0x2e2e2e, 0x3c7a4f, 0xd49a2a, 0x6a4c93, 0x1f7a8c, 0xc9c1b0];
  people.forEach((p, i) => pMesh.setColorAt(i, pc.setHex(cloth[Math.floor(rnd() * cloth.length)])));
  pMesh.castShadow = true;
  pMesh.userData.noPick = true;
  pMesh.frustumCulled = false;
  g.add(pMesh);

  B.build(g);

  // ============ animación ============
  const on = (h, a, b) => smooth(a - 0.4, a, h) * (1 - smooth(b - 0.4, b, h));
  function update(env, hour, time) {
    animateFountain(time);
    for(const j of plazaJets) {
      const h=1.15+0.72*(0.5+0.5*Math.sin(time*2.7+j.phase));
      j.mesh.scale.y=h; j.mesh.position.y=0.64+h/2;
    }
    for(const d of plazaDrops) {
      const u=(time*0.46+d.phase)%1, r=2.55+1.0*u;
      d.mesh.position.set(PX+Math.cos(d.a)*r,0.66+4*1.55*u*(1-u),PZ+Math.sin(d.a)*r);
      d.mesh.scale.setScalar(0.55+0.45*Math.sin(Math.PI*u));
    }
    for(const ripple of plazaRipples) {
      const u=(time*0.46+ripple.phase)%1, s=0.22+1.05*u;
      ripple.mesh.scale.set(s,1,s); ripple.mesh.material.opacity=0.25*(1-u);
    }
    const n = env.night;
    const gA = Math.max(on(hour, 15, 22.6), on(hour, 4.8, 9));
    const gB = on(hour, 15, 20.2);
    M.glassLit[0].emissiveIntensity = n * gA * 1.25;
    M.glassLit[1].emissiveIntensity = n * gB * 1.1;
    M.glassLit[2].emissiveIntensity = n * 1.2;
    M.strip.emissiveIntensity = 0.5 + n * 1.5;
    M.lamp.emissiveIntensity = n * 4.5;
    poolMat.opacity = n * 0.34;
    for (const p of pts) p.intensity = n * p.userData.I;
    for (const p of hLights) p.intensity = n * p.userData.I;
    signMat.color.setScalar(1.15 + n * 0.9);
    sculpt.rotation.y = time * 0.15;

    // Balanceo muy leve de las copas: el tronco conserva su punto de apoyo.
    for(const grove of treeInstances) {
      grove.records.forEach(([x,y,z,s,ry,tint],i)=>{
        const phase=time*0.72+h3(x,z,i)*Math.PI*2;
        const sway=Math.sin(phase)*(grove.species===2?0.007:0.012);
        d0.position.set(x,y,z);
        d0.rotation.set(sway*0.35,ry,sway);
        const width=0.84+h3(x,z,grove.species)*0.32;
        d0.scale.set(s*width,s*(0.9+0.25*tint),s*(1.68-width));
        d0.updateMatrix(); grove.mesh.setMatrixAt(i,d0.matrix);
      });
      grove.mesh.instanceMatrix.needsUpdate=true;
    }
    d0.rotation.set(0,0,0); d0.scale.setScalar(1);

    for (const f of flags) {
      const p = f.geometry.attributes.position, b = f.userData.base;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3];
        p.setZ(i, Math.sin(x * 2.4 - time * 5 + f.userData.ph) * 0.14 * x);
        p.setY(i, b[i * 3 + 1] + Math.sin(x * 1.7 - time * 4) * 0.04 * x);
      }
      p.needsUpdate = true;
    }

    const active = hour > 6.2 && hour < 21.5, lateOK = hour > 5.5 && hour < 23.3;
    people.forEach((p, i) => {
      const show = p.late ? lateOK : active;
      let t = (time * p.sp + p.ph) % (2 * p.L);
      if (t > p.L) t = 2 * p.L - t;
      const k = t / p.L, s = p.s;
      const dx = (s[2] - s[0]) / p.L, dz = (s[3] - s[1]) / p.L;
      d0.position.set(s[0] + (s[2] - s[0]) * k - dz * p.off, 0.12 + Math.abs(Math.sin(time * 5 * p.sp + i)) * 0.04, s[1] + (s[3] - s[1]) * k + dx * p.off);
      d0.scale.setScalar(show ? p.h : 0.0001);
      d0.updateMatrix();
      pMesh.setMatrixAt(i, d0.matrix);
    });
    d0.scale.setScalar(1);
    pMesh.instanceMatrix.needsUpdate = true;
  }

  return { update, group: g, blockH: { shell: hShell, roof: hRoof, interior: hInterior } };
}
