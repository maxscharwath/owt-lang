export function isSVGAttribute(name: string): boolean {
  const svgAttributes = [
    'strokeLinecap', 'strokeLinejoin', 'strokeWidth', 'fillRule',
    'clipPath', 'mask', 'markerStart', 'markerMid', 'markerEnd', 'markerUnits',
    'markerWidth', 'markerHeight', 'orient', 'refX', 'refY', 'markerUnits',
    'preserveAspectRatio', 'gradientUnits', 'gradientTransform', 'spreadMethod',
    'xlinkHref', 'xlinkTitle', 'xlinkShow', 'xlinkActuate', 'xlinkType',
    'xlinkRole', 'xlinkArcrole', 'xlinkTitle', 'xlinkShow', 'xlinkActuate',
    // Path and other SVG element attributes (both camelCase and kebab-case)
    'd', 'pathLength', 'pathOffset', 'strokeDasharray', 'strokeDashoffset',
    'strokeLinecap', 'strokeLinejoin', 'strokeMiterlimit', 'strokeOpacity',
    'strokeWidth', 'fillOpacity', 'fillRule', 'vectorEffect', 'clipRule',
    // Kebab-case versions
    'stroke-linecap', 'stroke-linejoin', 'stroke-width', 'stroke-dasharray',
    'stroke-dashoffset', 'stroke-miterlimit', 'stroke-opacity', 'fill-opacity',
    'fill-rule', 'vector-effect', 'clip-rule', 'path-length', 'path-offset'
  ];
  return svgAttributes.includes(name);
}

export function isSVGReadOnlyAttribute(name: string): boolean {
  const readOnlyAttributes = [
    'viewBox', 'preserveAspectRatio', 'gradientUnits', 'gradientTransform',
    'spreadMethod', 'xlinkHref', 'xlinkTitle', 'xlinkShow', 'xlinkActuate',
    'xlinkType', 'xlinkRole', 'xlinkArcrole'
  ];
  return readOnlyAttributes.includes(name);
}

