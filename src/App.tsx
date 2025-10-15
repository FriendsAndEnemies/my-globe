// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import * as THREE from 'three'
import { feature } from 'topojson-client'
import { presimplify, simplify } from 'topojson-simplify'

type GroupKey = 'CAN' | 'USA' | 'GBR' | 'CHN' | 'AUS'

const GROUPS: Record<GroupKey, { iso3: string[]; names: string[] }> = {
  CAN: { iso3: ['CAN'], names: ['Canada'] },
  USA: { iso3: ['USA'], names: ['United States of America', 'United States', 'USA'] },
  GBR: { iso3: ['GBR'], names: ['United Kingdom', 'United Kingdom of Great Britain and Northern Ireland', 'Great Britain', 'UK', 'England', 'Scotland', 'Wales', 'Northern Ireland'] },
  CHN: { iso3: ['CHN'], names: ['China', 'People\'s Republic of China', 'Peoples Republic of China'] },
  AUS: { iso3: ['AUS'], names: ['Australia'] }
}

const COUNTRY_STATS: Record<string, { offices: number; employees: number }> = {
  CAN: { offices: 10, employees: 1123 }, Canada: { offices: 10, employees: 1123 },
  USA: { offices: 6, employees: 362 }, 'United States of America': { offices: 6, employees: 362 },
  GBR: { offices: 17, employees: 765 }, 'United Kingdom': { offices: 17, employees: 765 },
  CHN: { offices: 3, employees: 12 }, China: { offices: 3, employees: 12 },
  AUS: { offices: 11, employees: 351 }, Australia: { offices: 11, employees: 351 }
}

const CUSTOM_VIEWS: Record<GroupKey, { lat: number; lng: number; altitude: number }> = {
  CAN: { lat: 40.61, lng: -98.85, altitude: 1.80 },
  USA: { lat: 27.00, lng: -95.21, altitude: 1.80 },
  GBR: { lat: 32.66, lng: -1.34, altitude: 1.80 },
  CHN: { lat: 20.23, lng: 105.72, altitude: 1.80 },
  AUS: { lat: -47.68, lng: 136.88, altitude: 1.80 }
}

const COLOR_DARK = 'rgba(45,45,45,1)'
const COLOR_MID = 'rgba(160,160,160,1)'

function norm(s?: string) {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function props(f: any) { return f?.properties ?? {} }

function getFeatISO3(f: any): string | undefined {
  const p = props(f)
  return p.ISO_A3 || p.iso_a3 || p.ADM0_A3 || p.adm0_a3 || p.SOV_A3 || p.sov_a3 || p.WB_A3 || p.wb_a3 || p.GU_A3 || p.gu_a3 || p.SU_A3 || p.su_a3 || p.A3 || p.a3
}

function getFeatName(f: any): string | undefined {
  const p = props(f)
  return p.ADMIN || p.admin || p.NAME_LONG || p.name_long || p.NAME_EN || p.name_en || p.NAME || p.name || p.SOVEREIGNT || p.sovereignt || p.GEOUNIT || p.geounit || p.BRK_NAME || p.brk_name
}

function groupId(f: any): GroupKey | null {
  const iso = (getFeatISO3(f) || '').toUpperCase()
  const nameN = norm(getFeatName(f))
  for (const key of Object.keys(GROUPS) as GroupKey[]) {
    if (GROUPS[key].iso3.includes(iso)) return key
  }
  for (const key of Object.keys(GROUPS) as GroupKey[]) {
    for (const nm of GROUPS[key].names) {
      if (norm(nm) === nameN) return key
    }
  }
  if (nameN.includes('united kingdom') || nameN.includes('great britain')) return 'GBR'
  return null
}

function isSelectable(f: any) { return groupId(f) !== null }

const useFlatGlobeMaterial = () => new THREE.MeshBasicMaterial({ color: 0x0b0b0b })

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const NEWTON_ITER = 8, NEWTON_EPS = 1e-6, SUBDIV_EPS = 1e-7
  const ax = 3 * x1 - 3 * x2 + 1, bx = -6 * x1 + 3 * x2, cx = 3 * x1
  const ay = 3 * y1 - 3 * y2 + 1, by = -6 * y1 + 3 * y2, cy = 3 * y1
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  function solveX(x: number) {
    let t = x
    for (let i = 0; i < NEWTON_ITER; i++) {
      const s = slopeX(t)
      if (Math.abs(s) < NEWTON_EPS) break
      t -= (sampleX(t) - x) / s
    }
    let t0 = 0, t1 = 1
    while (t0 < t1) {
      const xEst = sampleX(t)
      if (Math.abs(xEst - x) < SUBDIV_EPS) return t
      if (x > xEst) t0 = t; else t1 = t
      t = (t0 + t1) / 2
      if (t1 - t0 < SUBDIV_EPS) break
    }
    return t
  }
  return (x: number) => sampleY(solveX(Math.min(Math.max(x, 0), 1)))
}

const easeCB = cubicBezier(0.48, 0.2, 0.05, 0.99)
const easeInOut = cubicBezier(0.42, 0.00, 0.58, 1.00)

const RIM_VS = `
uniform float p;
varying float vIntensity;
void main() {
  vec3 vNormal = normalize(normalMatrix * normal);
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vec3 vDir = normalize(-mvPos.xyz);
  float rim = 1.0 - abs(dot(vNormal, vDir));
  vIntensity = pow(clamp(rim, 0.0, 1.0), p);
  gl_Position = projectionMatrix * mvPos;
}
`

const RIM_FS = `
uniform vec3 glowColor;
uniform float strength;
varying float vIntensity;
void main() {
  float i = vIntensity * strength;
  if (i < 0.02) discard;
  gl_FragColor = vec4(glowColor * i, i);
}
`

function useUrlParams() {
  const [params, setParams] = useState<URLSearchParams>(new URLSearchParams())
  useEffect(() => {
    const updateParams = () => setParams(new URLSearchParams(window.location.search))
    updateParams()
    window.addEventListener('popstate', updateParams)
    return () => window.removeEventListener('popstate', updateParams)
  }, [])
  return params
}

export default function App() {
  const globeRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const urlParams = useUrlParams()
  const [geoJson, setGeoJson] = useState<any>(null)
  const [hovered, setHovered] = useState<any>(null)
  const [selected, setSelected] = useState<any>(null)
  const [fadeT, setFadeT] = useState(0)
  const fadeRAF = useRef<number | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const globeMat = useMemo(() => useFlatGlobeMaterial(), [])

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current
        setDimensions({ width: clientWidth, height: clientHeight })
      }
    }
    updateDimensions()
    const resizeObserver = new ResizeObserver(updateDimensions)
    if (containerRef.current) resizeObserver.observe(containerRef.current)
    window.addEventListener('resize', updateDimensions)
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateDimensions)
    }
  }, [])

  useEffect(() => {
    (async () => {
      const MIN_W = 0.03
      const ID_TO_PROPS: Record<number, { ISO_A3: string; NAME: string }> = {
        840: { ISO_A3: 'USA', NAME: 'United States of America' },
        124: { ISO_A3: 'CAN', NAME: 'Canada' },
        826: { ISO_A3: 'GBR', NAME: 'United Kingdom' },
        156: { ISO_A3: 'CHN', NAME: 'China' },
        36: { ISO_A3: 'AUS', NAME: 'Australia' }
      }
      try {
        const topo = await (await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json', { mode: 'cors' })).json()
        const topoPresimplified = presimplify(topo)
        const topoSimplified = simplify(topoPresimplified, MIN_W)
        const fc: any = feature(topoSimplified, topoSimplified.objects.countries)
        fc.features.forEach((f: any) => {
          const id = +f.id
          const props = ID_TO_PROPS[id]
          f.properties = { ...(f.properties || {}), ...(props || {}) }
          if (props) {
            f.properties.ISO_A3 = props.ISO_A3
            f.properties.NAME = props.NAME
            f.properties.NAME_EN = props.NAME
            f.properties.ADMIN = props.NAME
          }
        })
        setGeoJson({ type: 'FeatureCollection', features: fc.features })
        return
      } catch (e) {
        console.warn('[50m topo] failed, falling back:', e)
      }
      const fallbacks = [
        'https://cdn.jsdelivr.net/npm/three-globe@2.31.1/example/datasets/ne_110m_admin_0_countries.geojson',
        'https://unpkg.com/three-globe@2.31.1/example/datasets/ne_110m_admin_0_countries.geojson',
        'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson'
      ]
      for (const url of fallbacks) {
        try {
          const res = await fetch(url, { mode: 'cors' })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          if (data?.features?.length) { setGeoJson(data); return }
        } catch (e) {
          console.warn('[fallback] failed:', url, e)
        }
      }
      console.error('[world polygons] All sources failed')
    })()
  }, [])

  useEffect(() => {
    if (!globeRef.current) return
    const controls = globeRef.current.controls()
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.enableZoom = false
    controls.minPolarAngle = THREE.MathUtils.degToRad(35)
    controls.maxPolarAngle = THREE.MathUtils.degToRad(145)
    controls.minDistance = controls.getDistance()
    controls.maxDistance = controls.getDistance()
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.25
    const pause = () => (controls.autoRotate = false)
    const resume = () => (controls.autoRotate = true)
    controls.addEventListener('start', pause)
    controls.addEventListener('end', resume)
    return () => {
      controls.removeEventListener('start', pause)
      controls.removeEventListener('end', resume)
    }
  }, [])

  useEffect(() => {
    if (!geoJson?.features || !globeRef.current) return
    const focusParam = urlParams.get('focus')?.toUpperCase() as GroupKey | null
    if (!focusParam || !GROUPS[focusParam]) return
    const targetFeature = geoJson.features.find((f: any) => groupId(f) === focusParam)
    if (!targetFeature) return
    const customView = CUSTOM_VIEWS[focusParam]
    setTimeout(() => {
      if (customView) {
        animatePOV(customView, 1500, easeInOut)
      } else {
        const [lng0, lat0] = sphericalCentroid(targetFeature)
        const lat = applyScreenLift(lat0)
        animatePOV({ lat, lng: lng0, altitude: 1.8 }, 1500, easeInOut)
      }
      startEasedFade(800, 1000)
      setSelected(targetFeature)
      setAutoRotate(globeRef, false)
    }, 1000)
  }, [geoJson, urlParams])

  const SCREEN_LIFT_DEG = 12
  function applyScreenLift(lat: number, liftDeg = SCREEN_LIFT_DEG) {
    const out = lat - liftDeg
    return Math.max(-85, Math.min(85, out))
  }

  function animatePOV(to: { lat: number; lng: number; altitude: number }, ms = 1000, easing: (t: number) => number = easeCB) {
    const g = globeRef.current
    if (!g) return
    const from = g.pointOfView()
    let dLng = to.lng - from.lng
    if (dLng > 180) dLng -= 360
    if (dLng < -180) dLng += 360
    const t0 = performance.now()
    function step(now: number) {
      const p = Math.min(1, (now - t0) / ms)
      const e = easing(p)
      g.pointOfView({ lat: from.lat + (to.lat - from.lat) * e, lng: from.lng + dLng * e, altitude: from.altitude + (to.altitude - from.altitude) * e })
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  function startEasedFade(delayMs = 500, durMs = 1000) {
    if (fadeRAF.current) cancelAnimationFrame(fadeRAF.current)
    const t0 = performance.now() + delayMs
    const t1 = t0 + durMs
    const tick = (now: number) => {
      if (now < t0) { setFadeT(0); fadeRAF.current = requestAnimationFrame(tick); return }
      const p = Math.min(1, (now - t0) / (t1 - t0))
      setFadeT(easeCB(p))
      if (p < 1) fadeRAF.current = requestAnimationFrame(tick)
    }
    fadeRAF.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    const lat0 = 40, lng0 = -10
    const lat = applyScreenLift(lat0)
    globeRef.current?.pointOfView({ lat, lng: lng0, altitude: 1.8 }, 0)
  }, [])

  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    const RADIUS = 100
    const scene = globe.scene()
    const glowGroup = new THREE.Group()
    scene.add(glowGroup)
    const innerMat = new THREE.ShaderMaterial({
      uniforms: { p: { value: 1.0 }, strength: { value: 0.8 }, glowColor: { value: new THREE.Color(0xffffff) } },
      vertexShader: RIM_VS,
      fragmentShader: RIM_FS,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: false
    })
    const inner = new THREE.Mesh(new THREE.SphereGeometry(RADIUS * 1.000, 128, 128), innerMat)
    inner.renderOrder = 999001
    glowGroup.add(inner)
    return () => {
      scene.remove(glowGroup)
      glowGroup.traverse(obj => {
        const mesh = obj as THREE.Mesh
        if (mesh.material && 'dispose' in mesh.material) mesh.material.dispose()
        if (mesh.geometry) mesh.geometry.dispose()
      })
    }
  }, [])

  const labelInfo = useMemo(() => {
    if (!selected) return null
    const g = groupId(selected) as GroupKey | null
    if (!g) return null
    const canonicalName: Record<GroupKey, string> = { CAN: 'Canada', USA: 'United States of America', GBR: 'United Kingdom', CHN: 'China', AUS: 'Australia' }
    const STATS_KEY = canonicalName[g]
    const officesParam = urlParams.get('offices')
    const employeesParam = urlParams.get('employees')
    const defaultStats = COUNTRY_STATS[g] || COUNTRY_STATS[STATS_KEY] || { offices: 0, employees: 0 }
    const stats = {
      offices: officesParam ? parseInt(officesParam, 10) || 0 : defaultStats.offices,
      employees: employeesParam ? parseInt(employeesParam, 10) || 0 : defaultStats.employees
    }
    return { name: canonicalName[g], offices: stats.offices.toLocaleString('en-US'), employees: stats.employees.toLocaleString('en-US') }
  }, [selected, urlParams])

  const hoveredGroup = useMemo(() => (hovered ? groupId(hovered) : null), [hovered])
  const HOVER_DUR_MS = 1000
  const [hoverAnimGroup, setHoverAnimGroup] = useState<GroupKey | null>(null)
  const [hoverAnimT, setHoverAnimT] = useState(0)
  const hoverRAF = useRef<number | null>(null)

  useEffect(() => {
    const toGroup = hoveredGroup
    const fromT = hoverAnimT
    const toT = toGroup ? 1 : 0
    if (toGroup && toGroup !== hoverAnimGroup) setHoverAnimGroup(toGroup)
    const t0 = performance.now()
    const start = fromT
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / HOVER_DUR_MS)
      const e = easeCB(p)
      setHoverAnimT(start + (toT - start) * e)
      if (p < 1) hoverRAF.current = requestAnimationFrame(step)
      else if (!toGroup) setHoverAnimGroup(null)
    }
    if (hoverRAF.current) cancelAnimationFrame(hoverRAF.current)
    hoverRAF.current = requestAnimationFrame(step)
    return () => { if (hoverRAF.current) cancelAnimationFrame(hoverRAF.current); hoverRAF.current = null }
  }, [hoveredGroup, hoverAnimT, hoverAnimGroup])

  const ALT_BASE = 0.005
  const MID_GREY_VAL = 160
  function greyToWhite(t: number) {
    const v = Math.max(0, Math.min(255, Math.round(MID_GREY_VAL + (255 - MID_GREY_VAL) * t)))
    return `rgba(${v},${v},${v},1)`
  }
  const polygonCapColor = (feat: any) => {
    const gid = groupId(feat)
    const selG = selected ? groupId(selected) : null
    if (selG && gid && gid === selG) return greyToWhite(fadeT)
    if (hoverAnimGroup && gid && gid === hoverAnimGroup) return greyToWhite(hoverAnimT)
    return isSelectable(feat) ? COLOR_MID : COLOR_DARK
  }
  const polygonSideColor = () => 'rgba(0,0,0,0)'
  const polygonStrokeColor = () => 'rgba(255,255,255,0.15)'
  const polygonAltitude = () => ALT_BASE

  return (
    <div id="globeRoot">
      {false && labelInfo && (
        <div style={{ 
          position: 'absolute',
          top: '24px',
          left: '80px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          pointerEvents: 'none',
          zIndex: 100
        }}>
          {/* Connecting Line */}
          <svg 
            style={{
              position: 'absolute',
              left: '-60px',
              top: '50px',
              width: '2px',
              height: '200px',
              pointerEvents: 'none'
            }}
          >
            <defs>
              <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="100%" stopColor="#1A5999" />
              </linearGradient>
            </defs>
            <line 
              x1="1" 
              y1="0" 
              x2="1" 
              y2="200" 
              stroke="url(#lineGradient)" 
              strokeWidth="2"
            />
          </svg>

          {/* Label Card */}
          <div className="country-label">
            <h2 style={{
              fontFamily: "'Canaccord Effra Bold', sans-serif",
              fontSize: '1.1rem',
              color: '#AEAEAE',
              textTransform: 'uppercase',
              fontWeight: 'bold',
              margin: 0,
              marginBottom: '24px',
              letterSpacing: '0.05em',
              textAlign: 'left'
            }}>
              {labelInfo.name}
            </h2>
            <div className="country-metrics" style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: '24px'
            }}>
              <div className="metric" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '4px'
              }}>
                <div className="num" style={{
                  fontFamily: "'Alike', serif",
                  fontSize: '2rem',
                  fontWeight: 400,
                  color: '#FFFFFF',
                  lineHeight: '1'
                }}>
                  {labelInfo.offices}
                </div>
                <div className="label" style={{
                  fontFamily: "'Canaccord Effra Regular', sans-serif",
                  fontSize: '1rem',
                  color: '#FFFFFF',
                  textTransform: 'none'
                }}>
                  Offices
                </div>
              </div>
              <div className="divider" style={{
                fontSize: '2rem',
                color: '#AEAEAE',
                lineHeight: '1',
                alignSelf: 'stretch',
                display: 'flex',
                alignItems: 'center'
              }}>/</div>
              <div className="metric" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '4px'
              }}>
                <div className="num" style={{
                  fontFamily: "'Alike', serif",
                  fontSize: '2rem',
                  fontWeight: 400,
                  color: '#FFFFFF',
                  lineHeight: '1'
                }}>
                  {labelInfo.employees}
                </div>
                <div className="label" style={{
                  fontFamily: "'Canaccord Effra Regular', sans-serif",
                  fontSize: '1rem',
                  color: '#FFFFFF',
                  textTransform: 'none'
                }}>
                  Employees
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="globeStage" ref={containerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
        {!geoJson?.features && (<div style={{ position: 'absolute', top: 12, left: 12, fontSize: 12, opacity: 0.7, pointerEvents: 'none' }}>Loading country polygons</div>)}
        <Globe ref={globeRef} width={dimensions.width} height={dimensions.height} backgroundColor="rgba(0,0,0,0)" showAtmosphere={true} atmosphereColor="#ffffff" atmosphereAltitude={0.2} globeMaterial={globeMat} rendererConfig={{ antialias: true, alpha: true, logarithmicDepthBuffer: true }} polygonsData={geoJson?.features || []} polygonCapColor={polygonCapColor} polygonSideColor={polygonSideColor} polygonStrokeColor={polygonStrokeColor} polygonAltitude={polygonAltitude} polygonsTransitionDuration={0} onPolygonHover={(f: any) => setHovered(f && isSelectable(f) ? f : null)} onPolygonClick={(feat: any) => { if (!isSelectable(feat)) return; const gid = groupId(feat) as GroupKey | null; if (gid && CUSTOM_VIEWS[gid]) { animatePOV(CUSTOM_VIEWS[gid], 1000, easeInOut) } else { const [lng0, lat0] = sphericalCentroid(feat); const lat = applyScreenLift(lat0); animatePOV({ lat, lng: lng0, altitude: 1.8 }, 1000, easeInOut) }; startEasedFade(500, 1000); setSelected(feat); setAutoRotate(globeRef, false) }} enablePointerInteraction={true} />
      </div>
    </div>
  )
}

function sphericalCentroid(feat: any): [number, number] {
  const type = feat.geometry.type
  const coords: any[] = type === 'Polygon' ? feat.geometry.coordinates : feat.geometry.coordinates.flat()
  let x = 0, y = 0, z = 0, n = 0
  for (const ring of coords as number[][][]) {
    for (const p of ring as number[][]) {
      const lng = (p[0] * Math.PI) / 180
      const lat = (p[1] * Math.PI) / 180
      const cl = Math.cos(lat)
      x += cl * Math.cos(lng); y += cl * Math.sin(lng); z += Math.sin(lat); n++
    }
  }
  if (!n) return [0, 0]
  x /= n; y /= n; z /= n
  const hyp = Math.hypot(x, y)
  const lat = (Math.atan2(z, hyp) * 180) / Math.PI
  let lng = (Math.atan2(y, x) * 180) / Math.PI
  if (lng > 180) lng -= 360
  if (lng < -180) lng += 360
  return [lng, lat]
}

function setAutoRotate(globeRef: React.RefObject<any>, on: boolean) {
  const g = globeRef.current
  if (!g) return
  const controls = g.controls()
  controls.autoRotate = on
}