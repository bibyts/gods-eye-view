/**
 * D-Space globe layer: renders pins and place markers into the Cesium viewer
 * and reports clicks. Owns its data source and event handler; nothing else.
 */

import * as Cesium from 'cesium';
import { approvedPins, placesOf } from './model.js';

export const CATEGORY_STYLE = Object.freeze({
  access: { color: '#00d4ff', glyph: 'A', label: 'Access' },
  shutoff: { color: '#ffb020', glyph: 'S', label: 'Shutoff' },
  medical: { color: '#ff4d6d', glyph: '+', label: 'Medical' },
  hazard: { color: '#ff6a00', glyph: '!', label: 'Hazard' },
  animal: { color: '#7bd88f', glyph: 'P', label: 'Animal' },
  info: { color: '#b8a1ff', glyph: 'i', label: 'Info' },
});

const iconCache = new Map();

function pinIcon(category, { draft = false, active = false } = {}) {
  const key = `${category}:${draft}:${active}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const style = CATEGORY_STYLE[category] || CATEGORY_STYLE.info;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = active ? 26 : 22;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  ctx.fillStyle = draft ? 'rgba(20,20,28,0.85)' : style.color;
  ctx.fill();
  ctx.lineWidth = active ? 6 : 4;
  ctx.strokeStyle = draft ? 'rgba(232,234,237,0.6)' : 'rgba(10,10,15,0.9)';
  if (draft) ctx.setLineDash([6, 5]);
  ctx.stroke();
  if (active) {
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = draft ? 'rgba(232,234,237,0.8)' : '#0a0a0f';
  ctx.font = `700 ${active ? 28 : 24}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(draft ? '?' : style.glyph, size / 2, size / 2 + 1);
  const url = canvas.toDataURL();
  iconCache.set(key, url);
  return url;
}

function houseIcon() {
  if (iconCache.has('house')) return iconCache.get('house');
  const canvas = document.createElement('canvas');
  canvas.width = 72;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(12,12,20,0.9)';
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(36, 8);
  ctx.lineTo(64, 32);
  ctx.lineTo(56, 32);
  ctx.lineTo(56, 62);
  ctx.lineTo(16, 62);
  ctx.lineTo(16, 32);
  ctx.lineTo(8, 32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Sound waves: this place speaks.
  ctx.lineWidth = 3;
  for (const radius of [8, 14]) {
    ctx.beginPath();
    ctx.arc(30, 46, radius, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
  }
  ctx.fillStyle = '#00d4ff';
  ctx.beginPath();
  ctx.arc(28, 46, 3.5, 0, Math.PI * 2);
  ctx.fill();
  const url = canvas.toDataURL();
  iconCache.set('house', url);
  return url;
}

/** Centroid of a place's pins. */
export function placeCenter(pins, place) {
  const own = pins.filter((pin) => pin.place === place);
  if (!own.length) return null;
  return {
    lat: own.reduce((sum, pin) => sum + pin.lat, 0) / own.length,
    lon: own.reduce((sum, pin) => sum + pin.lon, 0) / own.length,
  };
}

/**
 * Create the layer.
 * @param {{viewer: Cesium.Viewer, onPick: Function, onGlobeClick?: Function}} options
 */
export function createDSpaceLayer({ viewer, onPick, onGlobeClick }) {
  const dataSource = new Cesium.CustomDataSource('dspace');
  viewer.dataSources.add(dataSource);
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  let pins = [];
  let activeId = null;
  let placing = null;

  const request = () => viewer.scene.requestRender?.();

  function render() {
    dataSource.entities.suspendEvents();
    dataSource.entities.removeAll();
    for (const pin of pins) {
      const draft = pin.status !== 'approved';
      const active = pin.id === activeId;
      dataSource.entities.add({
        id: `dspace:pin:${pin.id}`,
        position: Cesium.Cartesian3.fromDegrees(pin.lon, pin.lat, pin.height ?? 2),
        billboard: {
          image: pinIcon(pin.category, { draft, active }),
          width: active ? 38 : 30,
          height: active ? 38 : 30,
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2500),
          scaleByDistance: new Cesium.NearFarScalar(50, 1.1, 2500, 0.55),
        },
        label: {
          text: draft ? `${pin.title} — DRAFT, not live` : pin.title,
          font: '600 13px Inter, sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -28),
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, active ? 2500 : 140),
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('rgba(10,10,15,0.7)'),
        },
      });
    }
    const live = approvedPins(pins);
    for (const place of placesOf(live)) {
      const center = placeCenter(live, place);
      dataSource.entities.add({
        id: `dspace:place:${place}`,
        position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, 14),
        billboard: {
          image: houseIcon(),
          width: 40,
          height: 40,
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 20000),
          scaleByDistance: new Cesium.NearFarScalar(100, 1.1, 20000, 0.5),
        },
        label: {
          text: place,
          font: '600 13px Inter, sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#00d4ff'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -32),
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(150, 3000),
        },
      });
    }
    dataSource.entities.resumeEvents();
    request();
  }

  function pickedTarget(position) {
    const picked = viewer.scene.pick(position);
    const id = picked?.id?.id;
    if (typeof id !== 'string' || !id.startsWith('dspace:')) return null;
    if (id.startsWith('dspace:pin:')) {
      const pin = pins.find((p) => p.id === id.slice('dspace:pin:'.length));
      return pin ? { type: 'pin', pin } : null;
    }
    return { type: 'place', place: id.slice('dspace:place:'.length) };
  }

  handler.setInputAction(({ position }) => {
    if (placing) {
      const ray = viewer.camera.getPickRay(position);
      const cartesian =
        (ray && viewer.scene.globe.pick(ray, viewer.scene)) ||
        viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid);
      if (!cartesian) return;
      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      const done = placing;
      placing = null;
      viewer.scene.canvas.style.cursor = '';
      done({
        lat: Number(Cesium.Math.toDegrees(carto.latitude).toFixed(6)),
        lon: Number(Cesium.Math.toDegrees(carto.longitude).toFixed(6)),
      });
      return;
    }
    const target = pickedTarget(position);
    if (target) onPick(target);
    else onGlobeClick?.();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  handler.setInputAction(({ endPosition }) => {
    if (placing) return;
    viewer.scene.canvas.style.cursor = pickedTarget(endPosition) ? 'pointer' : '';
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  function flyToPoint({ lat, lon }, { range = 70, pitch = -40, heading = 0, duration = 2.2 } = {}) {
    return new Promise((resolve) => {
      viewer.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(lon, lat, 0), 6),
        {
          offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(heading),
            Cesium.Math.toRadians(pitch),
            range,
          ),
          duration,
          complete: resolve,
          cancel: resolve,
        },
      );
    });
  }

  return {
    setPins(next) {
      pins = Array.isArray(next) ? next : [];
      render();
    },
    setActive(id) {
      activeId = id;
      render();
    },
    /** Fly from wherever the camera is to a point; resolves on arrival. */
    flyToPoint,
    /** A big arc from orbit down to a neighbourhood. */
    async flyFromOrbit(point) {
      await flyToPoint(point, { range: 2200, pitch: -60, duration: 3.5 });
      await flyToPoint(point, { range: 260, pitch: -45, heading: 20, duration: 2.5 });
    },
    /** Next globe click resolves with `{lat, lon}`. */
    pickLocation() {
      viewer.scene.canvas.style.cursor = 'crosshair';
      return new Promise((resolve) => {
        placing = resolve;
      });
    },
    cancelPick() {
      if (placing) placing(null);
      placing = null;
      viewer.scene.canvas.style.cursor = '';
    },
    destroy() {
      handler.destroy();
      viewer.dataSources.remove(dataSource, true);
    },
  };
}
