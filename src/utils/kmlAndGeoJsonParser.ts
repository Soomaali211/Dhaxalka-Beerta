import JSZip from 'jszip';

// Android DocumentsUI & WebView-safe accept attribute for GIS files (.geojson, .json, .kml, .kmz).
// Includes explicit extensions, standard + vendor MIME types, and wildcard MIME fallback so Android's
// system file picker never grays out .geojson or .kml files stored with application/octet-stream.
export const ANDROID_SAFE_GIS_ACCEPT =
  '.geojson,.json,.kml,.kmz,application/geo+json,application/vnd.geo+json,application/json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,text/xml,application/xml,text/plain,application/octet-stream,*/*';

// Android DocumentsUI-safe accept attribute for JSON backup files.
export const ANDROID_SAFE_JSON_BACKUP_ACCEPT =
  '.json,application/json,text/plain,application/octet-stream,*/*';

export interface GeoJsonFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates?: unknown;
    geometries?: unknown[];
  };
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  name?: string;
  features: GeoJsonFeature[];
}

function stripUtf8Bom(text: string): string {
  if (!text) return '';
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function decodeXmlEntities(raw: string): string {
  if (!raw) return '';
  const withoutCdata = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return withoutCdata
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

export function isLikelyKmlString(rawText: string): boolean {
  const trimmed = stripUtf8Bom(rawText || '').trim();
  if (!trimmed.startsWith('<')) return false;
  const head = trimmed.slice(0, 4000);
  return /<(?:\w+:)?(?:kml|Placemark|Document|Folder|Polygon|LineString|Point|MultiGeometry)\b/i.test(
    head
  );
}

/**
 * Parses KML `<coordinates>` text (`lon,lat[,alt] lon,lat[,alt] ...`) into `[lon, lat][]`.
 */
function parseKmlCoordinatesText(coordText: string): [number, number][] {
  const cleaned = decodeXmlEntities(coordText).trim();
  if (!cleaned) return [];
  const tokens = cleaned.split(/\s+/);
  const coords: [number, number][] = [];

  for (const token of tokens) {
    if (!token) continue;
    const parts = token.split(',');
    if (parts.length < 2) continue;
    const lon = Number(parts[0]);
    const lat = Number(parts[1]);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      coords.push([lon, lat]);
    }
  }
  return coords;
}

function ensureClosedLinearRing(coords: [number, number][]): [number, number][] {
  if (coords.length < 3) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 1e-9) {
    return [...coords, [first[0], first[1]]];
  }
  return coords;
}

function coercePropertyScalar(val: string): string | number {
  const trimmed = val.trim();
  if (trimmed !== '' && /^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
  }
  return trimmed;
}

/**
 * Extracts tag inner contents matching `<tagName ...>...</tagName>` (namespace-agnostic).
 */
function extractAllTagBlocks(xml: string, localTagName: string): { attrs: string; inner: string }[] {
  const results: { attrs: string; inner: string }[] = [];
  const re = new RegExp(
    `<(?:[\\w-]+:)?${localTagName}\\b([^>]*)>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${localTagName}\\s*>`,
    'gi'
  );
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    results.push({ attrs: match[1] || '', inner: match[2] || '' });
  }
  return results;
}

function extractFirstTagText(xml: string, localTagName: string): string | null {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${localTagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${localTagName}\\s*>`,
    'i'
  );
  const m = re.exec(xml);
  return m ? decodeXmlEntities(m[1]) : null;
}

function extractAttributeValue(attrs: string, attrName: string): string | null {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*["']([^"']*)["']`, 'i');
  const m = re.exec(attrs);
  return m ? decodeXmlEntities(m[1]) : null;
}

function parsePlacemarkProperties(placemarkXml: string): Record<string, unknown> {
  // Remove nested geometry blocks before reading top-level name/description so inner tags don't collide
  const withoutGeoms = placemarkXml.replace(
    /<(?:[\w-]+:)?(?:Polygon|LineString|Point|MultiGeometry)\b[\s\S]*?<\/(?:[\w-]+:)?(?:Polygon|LineString|Point|MultiGeometry)\s*>/gi,
    ''
  );

  const props: Record<string, unknown> = {};
  const nameVal = extractFirstTagText(withoutGeoms, 'name');
  if (nameVal) {
    props.name = nameVal;
  }
  const descVal = extractFirstTagText(withoutGeoms, 'description');
  if (descVal) {
    props.description = descVal;
    // Also parse simple HTML `<td>key</td><td>value</td>` pairs exported by QGIS/ArcGIS KML if present
    const rowRe = /<tr\b[^>]*>\s*<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>\s*<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(descVal)) !== null) {
      const k = rm[1].replace(/<[^>]+>/g, '').trim();
      const v = rm[2].replace(/<[^>]+>/g, '').trim();
      if (k && !(k in props)) {
        props[k] = coercePropertyScalar(v);
      }
    }
  }

  // ExtendedData -> <Data name="..."><value>...</value></Data>
  const dataBlocks = extractAllTagBlocks(withoutGeoms, 'Data');
  for (const db of dataBlocks) {
    const key = extractAttributeValue(db.attrs, 'name');
    const val = extractFirstTagText(db.inner, 'value');
    if (key && val !== null) {
      props[key] = coercePropertyScalar(val);
    }
  }

  // SchemaData -> <SimpleData name="...">...</SimpleData>
  const simpleBlocks = extractAllTagBlocks(withoutGeoms, 'SimpleData');
  for (const sb of simpleBlocks) {
    const key = extractAttributeValue(sb.attrs, 'name');
    const val = decodeXmlEntities(sb.inner);
    if (key) {
      props[key] = coercePropertyScalar(val);
    }
  }

  return props;
}

function extractGeometriesFromXmlFragment(
  xmlFragment: string
): GeoJsonFeature['geometry'][] {
  const geometries: GeoJsonFeature['geometry'][] = [];

  // Prevent double-extracting geometries inside <MultiGeometry> by stripping MultiGeometry first,
  // recursively collecting its children, and then parsing remaining standalone geometries.
  const multiBlocks = extractAllTagBlocks(xmlFragment, 'MultiGeometry');
  const strippedFragment = xmlFragment.replace(
    /<(?:[\w-]+:)?MultiGeometry\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?MultiGeometry\s*>/gi,
    ''
  );

  for (const mb of multiBlocks) {
    const childGeoms = extractGeometriesFromXmlFragment(mb.inner);
    if (childGeoms.length === 1) {
      geometries.push(childGeoms[0]);
    } else if (childGeoms.length > 1) {
      const allPolys = childGeoms.every((g) => g.type === 'Polygon');
      const allLines = childGeoms.every((g) => g.type === 'LineString');
      const allPoints = childGeoms.every((g) => g.type === 'Point');
      if (allPolys) {
        geometries.push({
          type: 'MultiPolygon',
          coordinates: childGeoms.map((g) => g.coordinates),
        });
      } else if (allLines) {
        geometries.push({
          type: 'MultiLineString',
          coordinates: childGeoms.map((g) => g.coordinates),
        });
      } else if (allPoints) {
        geometries.push({
          type: 'MultiPoint',
          coordinates: childGeoms.map((g) => g.coordinates),
        });
      } else {
        geometries.push({
          type: 'GeometryCollection',
          geometries: childGeoms,
        });
      }
    }
  }

  // 1. Polygons
  const polyBlocks = extractAllTagBlocks(strippedFragment, 'Polygon');
  for (const pb of polyBlocks) {
    const outerBlocks = extractAllTagBlocks(pb.inner, 'outerBoundaryIs');
    const outerCoordStr =
      outerBlocks.length > 0
        ? extractFirstTagText(outerBlocks[0].inner, 'coordinates')
        : extractFirstTagText(pb.inner, 'coordinates');
    if (!outerCoordStr) continue;
    const outerRing = ensureClosedLinearRing(parseKmlCoordinatesText(outerCoordStr));
    if (outerRing.length < 4) continue;

    const rings: [number, number][][] = [outerRing];
    const innerBlocks = extractAllTagBlocks(pb.inner, 'innerBoundaryIs');
    for (const ib of innerBlocks) {
      const innerCoordStr = extractFirstTagText(ib.inner, 'coordinates');
      if (!innerCoordStr) continue;
      const holeRing = ensureClosedLinearRing(parseKmlCoordinatesText(innerCoordStr));
      if (holeRing.length >= 4) {
        rings.push(holeRing);
      }
    }
    geometries.push({
      type: 'Polygon',
      coordinates: rings,
    });
  }

  // 2. LineStrings (ignore LinearRing inside Polygon by stripping Polygon blocks first)
  const withoutPolygons = strippedFragment.replace(
    /<(?:[\w-]+:)?Polygon\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?Polygon\s*>/gi,
    ''
  );
  const lineBlocks = extractAllTagBlocks(withoutPolygons, 'LineString');
  for (const lb of lineBlocks) {
    const coordStr = extractFirstTagText(lb.inner, 'coordinates');
    if (!coordStr) continue;
    const linePts = parseKmlCoordinatesText(coordStr);
    if (linePts.length >= 2) {
      geometries.push({
        type: 'LineString',
        coordinates: linePts,
      });
    }
  }

  // Also support standalone `<LinearRing>` if exported without `<Polygon>` wrapper
  const withoutLines = withoutPolygons.replace(
    /<(?:[\w-]+:)?LineString\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?LineString\s*>/gi,
    ''
  );
  const standaloneRings = extractAllTagBlocks(withoutLines, 'LinearRing');
  for (const sr of standaloneRings) {
    const coordStr = extractFirstTagText(sr.inner, 'coordinates');
    if (!coordStr) continue;
    const ringPts = ensureClosedLinearRing(parseKmlCoordinatesText(coordStr));
    if (ringPts.length >= 4) {
      geometries.push({
        type: 'Polygon',
        coordinates: [ringPts],
      });
    }
  }

  // 3. Points
  const pointBlocks = extractAllTagBlocks(withoutLines, 'Point');
  for (const ptb of pointBlocks) {
    const coordStr = extractFirstTagText(ptb.inner, 'coordinates');
    if (!coordStr) continue;
    const pts = parseKmlCoordinatesText(coordStr);
    if (pts.length >= 1) {
      geometries.push({
        type: 'Point',
        coordinates: pts[0],
      });
    }
  }

  return geometries;
}

/**
 * Converts a KML XML string into a standard GeoJSON FeatureCollection.
 * Works identically in Browser, Android Capacitor WebView, and Node.js CLI tests.
 */
export function convertKmlTextToGeoJsonObject(
  kmlText: string,
  fileName = 'layer.kml'
):
  | { ok: true; geoJson: GeoJsonFeatureCollection; featureCount: number }
  | { ok: false; errorSomali: string } {
  const cleaned = stripUtf8Bom(kmlText || '').trim();
  if (!cleaned) {
    return {
      ok: false,
      errorSomali: `Faylka KML "${fileName}" waa madhan yahay.`,
    };
  }

  const features: GeoJsonFeature[] = [];
  const placemarks = extractAllTagBlocks(cleaned, 'Placemark');

  if (placemarks.length > 0) {
    for (const pm of placemarks) {
      const props = parsePlacemarkProperties(pm.inner);
      const geoms = extractGeometriesFromXmlFragment(pm.inner);
      for (const geom of geoms) {
        features.push({
          type: 'Feature',
          properties: { ...props },
          geometry: geom,
        });
      }
    }
  } else {
    // Fallback for bare KML fragments containing <Polygon> or <LineString> without <Placemark>
    const bareGeoms = extractGeometriesFromXmlFragment(cleaned);
    for (const geom of bareGeoms) {
      features.push({
        type: 'Feature',
        properties: { name: fileName.replace(/\.[^.]+$/, '') },
        geometry: geom,
      });
    }
  }

  if (features.length === 0) {
    return {
      ok: false,
      errorSomali: `Faylka KML "${fileName}" lagama helin wax geometry ah (Polygon, LineString ama Point).`,
    };
  }

  const docName =
    extractFirstTagText(
      cleaned.replace(/<(?:[\w-]+:)?Placemark\b[\s\S]*$/i, ''),
      'name'
    ) || fileName.replace(/\.[^.]+$/, '');

  return {
    ok: true,
    geoJson: {
      type: 'FeatureCollection',
      name: docName,
      features,
    },
    featureCount: features.length,
  };
}

/**
 * Reads any uploaded GIS file (`.geojson`, `.json`, `.kml`, or `.kmz`) on Web or Android APK
 * and normalizes it into valid GeoJSON text + parsed object.
 */
export async function readAndNormalizeGisFile(file: File): Promise<
  | {
      ok: true;
      fileName: string;
      fileText: string;
      rawJson: unknown;
      sourceFormat: 'geojson' | 'kml' | 'kmz';
    }
  | {
      ok: false;
      errorSomali: string;
    }
> {
  if (!file) {
    return { ok: false, errorSomali: 'Fayl lama dooran.' };
  }

  const lowerName = (file.name || '').toLowerCase();

  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Detect ZIP / KMZ by `.kmz` extension or PK\x03\x04 magic header
    const isZipHeader =
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04;

    if (lowerName.endsWith('.kmz') || isZipHeader) {
      const zip = await JSZip.loadAsync(buffer);
      const entryNames = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

      const kmlEntryName =
        entryNames.find((n) => /doc\.kml$/i.test(n)) ||
        entryNames.find((n) => /\.kml$/i.test(n));

      if (kmlEntryName) {
        const kmlXml = await zip.files[kmlEntryName].async('string');
        const converted = convertKmlTextToGeoJsonObject(kmlXml, file.name);
        if (converted.ok === false) {
          return converted;
        }
        return {
          ok: true,
          fileName: file.name,
          fileText: JSON.stringify(converted.geoJson),
          rawJson: converted.geoJson,
          sourceFormat: 'kmz',
        };
      }

      const geoJsonEntryName = entryNames.find((n) => /\.(geojson|json)$/i.test(n));
      if (geoJsonEntryName) {
        const jsonStr = stripUtf8Bom(await zip.files[geoJsonEntryName].async('string')).trim();
        const parsed = JSON.parse(jsonStr);
        return {
          ok: true,
          fileName: file.name,
          fileText: jsonStr,
          rawJson: parsed,
          sourceFormat: 'geojson',
        };
      }

      return {
        ok: false,
        errorSomali: `Faylka "${file.name}" (.kmz/.zip) gudihiisa lagama helin fayl .kml ama .geojson ah.`,
      };
    }

    const decodedText = stripUtf8Bom(new TextDecoder('utf-8').decode(bytes)).trim();
    if (!decodedText) {
      return {
        ok: false,
        errorSomali: `Faylka "${file.name}" waa madhan yahay.`,
      };
    }

    // Check if KML XML (by extension `.kml` or XML content)
    if (lowerName.endsWith('.kml') || isLikelyKmlString(decodedText)) {
      const converted = convertKmlTextToGeoJsonObject(decodedText, file.name);
      if (converted.ok === false) {
        return converted;
      }
      return {
        ok: true,
        fileName: file.name,
        fileText: JSON.stringify(converted.geoJson),
        rawJson: converted.geoJson,
        sourceFormat: 'kml',
      };
    }

    // Otherwise parse as GeoJSON / JSON
    try {
      const parsed = JSON.parse(decodedText);
      if (!parsed || typeof parsed !== 'object') {
        return {
          ok: false,
          errorSomali: `Faylka "${file.name}" malaha qaab GeoJSON ama KML la aqoonsan karo.`,
        };
      }
      return {
        ok: true,
        fileName: file.name,
        fileText: decodedText,
        rawJson: parsed,
        sourceFormat: 'geojson',
      };
    } catch {
      return {
        ok: false,
        errorSomali: `Faylka "${file.name}" ma aha GeoJSON ama KML sax ah. Fadlan dooro fayl .geojson, .json, .kml ama .kmz ah.`,
      };
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Khalad akhrinta faylka';
    return {
      ok: false,
      errorSomali: `Faylka "${file.name}" waa la akhrin kari waayey (${detail}).`,
    };
  }
}
