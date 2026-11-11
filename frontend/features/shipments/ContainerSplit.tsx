"use client";

import { useEffect, useRef } from "react";
import type { Container } from "@/lib/domain/types";
import { formatInt } from "@/lib/domain/weights";

const COLORS = ["#F47B20", "#F3ED3A", "#5A5B64", "#FFB37A", "#BDB82E", "#8E8F98"];

/**
 * Part de chaque produit dans les cartons d'un conteneur.
 * La barre et la légende portent toute l'information ; la vue 3D (Three.js, chargé seulement ici)
 * la montre autrement et remplace la barre quand elle est prête.
 */
export function ContainerSplit({ container }: { container: Container }) {
  const host = useRef<HTMLDivElement>(null);
  const items = container.items.map((it, i) => ({ ...it, color: COLORS[i % COLORS.length] })).filter((it) => it.quantityCartons > 0);
  const total = items.reduce((n, it) => n + it.quantityCartons, 0);
  // Clé stable : la scène n'est reconstruite que si la répartition change.
  const signature = items.map((it) => `${it.id}:${it.quantityCartons}`).join("|");

  useEffect(() => {
    const el = host.current;
    if (!el || !total || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let stop = () => {};
    let cancelled = false;

    void Promise.all([import("three"), import("gsap")]).then(([T, { default: gsap }]) => {
      if (cancelled || !el.isConnected) return;
      const w = el.clientWidth;
      const h = 300;
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(32, w / h, 0.1, 100);
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(w, h); // shortcut: taille fixée à l'ouverture, pas de suivi du redimensionnement
      const dz = Math.max(9.5, 24.5 / (w / h));
      camera.position.set(0, dz * 0.36, dz);
      camera.lookAt(0, 0, 0);
      scene.add(new T.AmbientLight(0xffffff, 2.2));
      const light = new T.DirectionalLight(0xffffff, 2.4);
      light.position.set(6, 10, 8);
      scene.add(light);

      const L = 12, H = 2.4, W = 2.4;
      const group = new T.Group();
      group.rotation.y = -0.5;
      scene.add(group);
      const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
      group.add(new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(L, H, W)), new T.LineBasicMaterial({ color: ink })));
      const floor = new T.Mesh(new T.BoxGeometry(L + 0.3, 0.18, W + 0.3), new T.MeshStandardMaterial({ color: 0x26262b }));
      floor.position.y = -H / 2 - 0.09;
      group.add(floor);

      let x = -L / 2;
      const blocks = items.map((it) => {
        const len = (it.quantityCartons / total) * L;
        const mesh = new T.Mesh(new T.BoxGeometry(Math.max(len - 0.06, 0.02), H - 0.3, W - 0.2), new T.MeshStandardMaterial({ color: it.color, roughness: 0.7 }));
        mesh.position.set(x + len / 2, -0.15, 0);
        x += len;
        group.add(mesh);
        return mesh;
      });

      const canvas = renderer.domElement;
      el.replaceChildren(canvas);
      gsap.from(blocks.map((m) => m.scale), { y: 0.001, duration: 0.6, ease: "expo.out", stagger: 0.07 });

      let drag: number | null = null;
      canvas.onpointerdown = (e) => {
        drag = e.clientX;
        canvas.setPointerCapture(e.pointerId);
      };
      canvas.onpointermove = (e) => {
        if (drag === null) return;
        group.rotation.y += (e.clientX - drag) * 0.01;
        drag = e.clientX;
      };
      canvas.onpointerup = canvas.onpointercancel = () => (drag = null);

      let frame = 0;
      const loop = () => {
        if (drag === null) group.rotation.y += 0.0025;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(loop);
      };
      loop();
      stop = () => {
        cancelAnimationFrame(frame);
        renderer.dispose();
      };
    });

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` résume items et total
  }, [signature]);

  if (!total) return <p className="empty">Ce conteneur est vide.</p>;
  return (
    <>
      <div key={signature} ref={host} className="v3d" role="img" aria-label="Répartition des produits dans le conteneur">
        <div className="bar2d">
          {items.map((it) => (
            <i key={it.id} style={{ flex: it.quantityCartons, background: it.color }} />
          ))}
        </div>
      </div>
      <ul className="leg">
        {items.map((it) => (
          <li key={it.id}>
            <i style={{ background: it.color }} />
            <span>{it.designation}</span>
            <b className="num">{formatInt(it.quantityCartons)}</b>
            <span className="muted num">{Math.round((it.quantityCartons / total) * 100)} %</span>
          </li>
        ))}
      </ul>
      <p className="note">Vue indicative : chaque bloc montre la part d&apos;un produit dans les cartons du conteneur, pas le volume réel. Faites glisser pour tourner.</p>
    </>
  );
}
