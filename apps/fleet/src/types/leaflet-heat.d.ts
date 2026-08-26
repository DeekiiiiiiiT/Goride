declare module 'leaflet.heat' {
  import type * as L from 'leaflet';
  // Side-effect module: extends L with heatLayer
  const heat: unknown;
  export default heat;
}

declare module 'leaflet' {
  namespace L {
    function heatLayer(
      latlngs: Array<[number, number, number?]>,
      options?: Record<string, unknown>,
    ): Layer;
  }
}
