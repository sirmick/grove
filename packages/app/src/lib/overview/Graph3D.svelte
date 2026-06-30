<script lang="ts">
  import { onMount } from 'svelte'
  import * as THREE from 'three'
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

  export interface GraphNode3D {
    slug: string
    title: string
    degree: number
    dim: boolean
    related: boolean
  }

  export interface GraphEdge3D {
    key: string
    src: string
    dst: string
    active: boolean
  }

  let {
    nodes = [],
    edges = [],
    activeSlug = '',
    onselect,
    onopen,
  }: {
    nodes?: GraphNode3D[]
    edges?: GraphEdge3D[]
    activeSlug?: string
    onselect?: (slug: string) => void
    onopen?: (slug: string) => void
  } = $props()

  interface Particle {
    data: GraphNode3D
    pos: THREE.Vector3
    vel: THREE.Vector3
    mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
    label: THREE.Sprite
  }

  interface LinkObject {
    data: GraphEdge3D
    src: Particle
    dst: Particle
    line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  }

  let host: HTMLDivElement
  let renderer: THREE.WebGLRenderer
  let scene: THREE.Scene
  let camera: THREE.PerspectiveCamera
  let controls: OrbitControls
  let animation = 0
  let observer: ResizeObserver | undefined
  let particles: Particle[] = []
  let links: LinkObject[] = []
  let nodeGroup = new THREE.Group()
  let edgeGroup = new THREE.Group()
  let hovered: Particle | null = null
  const pointer = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()
  const palette = ['#008f73', '#276ef1', '#c56a00', '#d33f49', '#8357c5', '#007c9b', '#b7791f']

  function hash(s: string): number {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
    return h >>> 0
  }

  function collectionColor(slug: string): THREE.Color {
    const root = slug.split('/')[0] ?? slug
    return new THREE.Color(palette[hash(root) % palette.length])
  }

  function disposeObject(obj: THREE.Object3D) {
    obj.traverse((child) => {
      const mesh = child as Partial<THREE.Mesh>
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined
      const geometry = mesh.geometry as THREE.BufferGeometry | undefined
      geometry?.dispose()
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material?.dispose()
    })
  }

  function makeLabel(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.font = '600 34px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 10
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)'
      ctx.fillStyle = '#172033'
      const label = text.length > 28 ? `${text.slice(0, 25)}...` : text
      ctx.strokeText(label, 256, 64)
      ctx.fillText(label, 256, 64)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
    )
    sprite.scale.set(15, 3.75, 1)
    return sprite
  }

  function seededPosition(i: number, count: number, slug: string): THREE.Vector3 {
    const golden = Math.PI * (3 - Math.sqrt(5))
    const y = 1 - (i / Math.max(1, count - 1)) * 2
    const radius = Math.sqrt(1 - y * y)
    const theta = golden * i + (hash(slug) % 360) * (Math.PI / 180)
    const shell = 18 + (hash(slug) % 18)
    return new THREE.Vector3(
      Math.cos(theta) * radius * shell,
      y * shell,
      Math.sin(theta) * radius * shell,
    )
  }

  function buildScene() {
    disposeObject(nodeGroup)
    disposeObject(edgeGroup)
    scene.remove(nodeGroup)
    scene.remove(edgeGroup)
    nodeGroup = new THREE.Group()
    edgeGroup = new THREE.Group()
    scene.add(edgeGroup, nodeGroup)

    const bySlug = new Map<string, Particle>()
    const sorted = nodes.toSorted((a, b) => b.degree - a.degree || a.title.localeCompare(b.title))
    particles = sorted.map((data, i) => {
      const size = 0.95 + Math.min(2.4, data.degree * 0.3)
      const material = new THREE.MeshStandardMaterial({
        color: collectionColor(data.slug),
        emissive: collectionColor(data.slug),
        emissiveIntensity: 0.28,
        metalness: 0.1,
        roughness: 0.38,
        transparent: true,
      })
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 24, 16), material)
      const pos = seededPosition(i, sorted.length, data.slug)
      mesh.position.copy(pos)
      mesh.userData.slug = data.slug
      const label = makeLabel(data.title)
      label.position.copy(pos).add(new THREE.Vector3(0, size + 2.4, 0))
      nodeGroup.add(mesh, label)
      const particle = {
        data,
        pos,
        vel: new THREE.Vector3(),
        mesh,
        label,
      }
      bySlug.set(data.slug, particle)
      return particle
    })

    links = edges
      .map((data) => {
        const src = bySlug.get(data.src)
        const dst = bySlug.get(data.dst)
        if (!src || !dst) return null
        const geometry = new THREE.BufferGeometry().setFromPoints([src.pos, dst.pos])
        const material = new THREE.LineBasicMaterial({
          color: data.active ? '#16836f' : '#5878c9',
          transparent: true,
          opacity: data.active || !activeSlug ? 0.82 : 0.22,
        })
        const line = new THREE.Line(geometry, material)
        edgeGroup.add(line)
        return { data, src, dst, line }
      })
      .filter((x): x is LinkObject => Boolean(x))
    updateStyles()
  }

  function updateStyles() {
    for (const p of particles) {
      const isActive = p.data.slug === activeSlug
      const isHover = p === hovered
      const isRelated = p.data.related
      const color = isActive
        ? new THREE.Color('#d87500')
        : isHover
          ? new THREE.Color('#111827')
          : isRelated
            ? new THREE.Color('#008f73')
            : collectionColor(p.data.slug)
      p.mesh.material.color.copy(color)
      p.mesh.material.emissive.copy(color)
      p.mesh.material.emissiveIntensity = isActive || isHover ? 0.32 : isRelated ? 0.18 : 0.08
      p.mesh.material.opacity = p.data.dim ? 0.28 : 1
      p.label.visible = isActive || isHover || isRelated || p.data.degree >= 2
      const labelMat = p.label.material as THREE.SpriteMaterial
      labelMat.opacity = p.data.dim ? 0.42 : 1
    }
    for (const l of links) {
      l.line.material.color.set(l.data.active || !activeSlug ? '#16836f' : '#5878c9')
      l.line.material.opacity = l.data.active || !activeSlug ? 0.84 : 0.2
    }
  }

  function stepPhysics() {
    const repulsion = 5.5
    const spring = 0.0028
    const target = 28
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i]
      if (!a) continue
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j]
        if (!b) continue
        const delta = a.pos.clone().sub(b.pos)
        const distSq = Math.max(18, delta.lengthSq())
        delta.normalize().multiplyScalar(repulsion / distSq)
        a.vel.add(delta)
        b.vel.sub(delta)
      }
    }
    for (const l of links) {
      const delta = l.dst.pos.clone().sub(l.src.pos)
      const dist = Math.max(0.01, delta.length())
      const force = delta.normalize().multiplyScalar((dist - target) * spring)
      l.src.vel.add(force)
      l.dst.vel.sub(force)
    }
    for (const p of particles) {
      p.vel.add(p.pos.clone().multiplyScalar(-0.0018))
      p.vel.multiplyScalar(0.89)
      p.pos.add(p.vel)
      p.mesh.position.copy(p.pos)
      p.label.position.copy(p.pos).add(new THREE.Vector3(0, p.mesh.geometry.parameters.radius + 2.4, 0))
    }
    for (const l of links) {
      const attr = l.line.geometry.getAttribute('position') as THREE.BufferAttribute
      attr.setXYZ(0, l.src.pos.x, l.src.pos.y, l.src.pos.z)
      attr.setXYZ(1, l.dst.pos.x, l.dst.pos.y, l.dst.pos.z)
      attr.needsUpdate = true
      l.line.geometry.computeBoundingSphere()
    }
  }

  function resize() {
    const rect = host.getBoundingClientRect()
    const width = Math.max(320, rect.width)
    const height = Math.max(280, rect.height)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  function animate() {
    stepPhysics()
    controls.update()
    renderer.render(scene, camera)
    animation = requestAnimationFrame(animate)
  }

  function particleFromPointer(e: MouseEvent | PointerEvent): Particle | null {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(particles.map((p) => p.mesh), false)
    const slug = hits[0]?.object.userData.slug as string | undefined
    return particles.find((p) => p.data.slug === slug) ?? null
  }

  function onPointerMove(e: PointerEvent) {
    const next = particleFromPointer(e)
    if (next === hovered) return
    hovered = next
    host.style.cursor = hovered ? 'pointer' : 'grab'
    updateStyles()
  }

  function onClick(e: MouseEvent) {
    const hit = particleFromPointer(e)
    if (hit) onselect?.(hit.data.slug)
  }

  function onDoubleClick(e: MouseEvent) {
    const hit = particleFromPointer(e)
    if (hit) onopen?.(hit.data.slug)
  }

  onMount(() => {
    scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2('#f6f8fb', 0.009)
    camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1000)
    camera.position.set(0, 8, 76)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor('#f6f8fb', 1)
    host.appendChild(renderer.domElement)
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.rotateSpeed = 0.42
    controls.zoomSpeed = 0.75
    controls.minDistance = 28
    controls.maxDistance = 160

    const ambient = new THREE.AmbientLight('#ffffff', 1.05)
    const key = new THREE.DirectionalLight('#ffffff', 1.7)
    key.position.set(30, 45, 60)
    const fill = new THREE.PointLight('#7cc9bc', 2.4, 160)
    fill.position.set(-30, -14, 38)
    scene.add(ambient, key, fill)

    const stars = new THREE.BufferGeometry()
    const starPositions = new Float32Array(450 * 3)
    for (let i = 0; i < 450; i++) {
      const h = hash(`star-${i}`)
      starPositions[i * 3] = ((h % 1000) / 1000 - 0.5) * 220
      starPositions[i * 3 + 1] = (((h >>> 10) % 1000) / 1000 - 0.5) * 150
      starPositions[i * 3 + 2] = (((h >>> 20) % 1000) / 1000 - 0.5) * 180
    }
    stars.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    scene.add(
      new THREE.Points(
        stars,
        new THREE.PointsMaterial({
          color: '#9aaabd',
          size: 0.24,
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
        }),
      ),
    )

    host.addEventListener('pointermove', onPointerMove)
    host.addEventListener('click', onClick)
    host.addEventListener('dblclick', onDoubleClick)
    observer = new ResizeObserver(resize)
    observer.observe(host)
    buildScene()
    resize()
    animate()
    return () => {
      cancelAnimationFrame(animation)
      observer?.disconnect()
      host.removeEventListener('pointermove', onPointerMove)
      host.removeEventListener('click', onClick)
      host.removeEventListener('dblclick', onDoubleClick)
      controls.dispose()
      disposeObject(scene)
      renderer.dispose()
      renderer.domElement.remove()
    }
  })

  $effect(() => {
    if (!scene) return
    buildScene()
  })
</script>

<div class="graph3d" bind:this={host}></div>

<style>
  .graph3d {
    width: 100%;
    height: clamp(360px, 58vh, 680px);
    min-height: 360px;
    overflow: hidden;
    cursor: grab;
    background: linear-gradient(180deg, #fbfcfe 0%, #eef3f8 100%);
  }
  .graph3d:active {
    cursor: grabbing;
  }
  .graph3d :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
