import * as THREE from '/vendor/three.module.js';

// Procedural meeting presentation. Invitations move avatars, never work records,
// people, device hardware or the underlying employee execution queues.
export function createMeeting3D(host, {onEmployee, onTablet, onBoard, onExit, onArrival} = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const lowPower = (navigator.deviceMemory || 8) <= 4 || (navigator.hardwareConcurrency || 4) <= 2;
  const renderer = new THREE.WebGLRenderer({antialias: !lowPower, alpha: false, powerPreference: 'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPower ? 1 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab;outline-offset:-4px';
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'CEO meeting room. You lead the meeting. Click the wall board or tablet for your meeting board. Drag or swipe to look around. Arrow keys look; Home centers. Tab focuses room controls; Enter opens the selected control. Escape leaves the room. Employee arrivals are an invitation animation, separate from their actual work.');
  host.append(canvas);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c6d5dc');
  const camera = new THREE.PerspectiveCamera(63, 1, .055, 160);
  camera.position.set(0, 1.38, 7.45);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  let yaw = 0, pitch = -.065, enabled = true, disposed = false, paused = false, contextLost = false, inViewport = true;
  let dirty = true, frame = 0, lastFrame = 0, elapsed = 0, inviteKey = '', activeMeeting = false;
  let shadowsDirty = true, lastShadow = 0;
  let voiceAgent = null, voiceSpeaking = false, focusIndex = -1, rosterSignature = '', labelSignature = '', visualSignature = '', chairSignature = '';
  const geometry = new Set(), materials = new Set(), textures = new Set(), extras = new Set();
  const interactives = [], actors = new Map(), events = [], pointers = new Map();
  const room = new THREE.Group(); scene.add(room);
  const workforce = new THREE.Group(); scene.add(workforce);
  const avatarInstances = new THREE.Group(); scene.add(avatarInstances);
  let avatarBatches = [];
  const boxGeo = keepGeo(new THREE.BoxGeometry(1, 1, 1));
  const sphereGeo = keepGeo(new THREE.SphereGeometry(1, lowPower ? 14 : 22, lowPower ? 10 : 16));
  const cylinderGeo = keepGeo(new THREE.CylinderGeometry(1, 1, 1, lowPower ? 12 : 22));
  const planeGeo = keepGeo(new THREE.PlaneGeometry(1, 1));
  const hairGeo = keepGeo(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, 1.31));
  const glassesGeo = keepGeo(new THREE.TorusGeometry(.036, .004, 5, 14));
  const roundShape = new THREE.Shape();
  roundShape.moveTo(-.43, -.5); roundShape.lineTo(.43, -.5); roundShape.quadraticCurveTo(.5, -.5, .5, -.43);
  roundShape.lineTo(.5, .43); roundShape.quadraticCurveTo(.5, .5, .43, .5); roundShape.lineTo(-.43, .5);
  roundShape.quadraticCurveTo(-.5, .5, -.5, .43); roundShape.lineTo(-.5, -.43); roundShape.quadraticCurveTo(-.5, -.5, -.43, -.5);
  const roundGeo = keepGeo(new THREE.ExtrudeGeometry(roundShape, {depth: .9, bevelEnabled: true, bevelThickness: .035, bevelSize: .035, bevelSegments: 2, curveSegments: 5, steps: 1}));
  roundGeo.center(); roundGeo.computeBoundingBox();
  const bounds = new THREE.Vector3(); roundGeo.boundingBox.getSize(bounds); roundGeo.scale(1 / bounds.x, 1 / bounds.y, 1 / bounds.z);
  function keepGeo(value) { geometry.add(value); return value; }
  function mat(color, options = {}) { const m = new THREE.MeshStandardMaterial({color, roughness: .65, ...options}); materials.add(m); return m; }
  function basic(options) { const m = new THREE.MeshBasicMaterial(options); materials.add(m); return m; }
  function shape(parent, geo, material, x, y, z, w, h, d, shadow = true) {
    const mesh = new THREE.Mesh(geo, material); mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  const box = (p, m, x, y, z, w, h, d, s) => shape(p, boxGeo, m, x, y, z, w, h, d, s);
  const round = (p, m, x, y, z, w, h, d, s) => shape(p, roundGeo, m, x, y, z, w, h, d, s);
  const ball = (p, m, x, y, z, w, h = w, d = w, s) => shape(p, sphereGeo, m, x, y, z, w, h, d, s);
  const tube = (p, m, x, y, z, r, h, s) => shape(p, cylinderGeo, m, x, y, z, r, h, r, s);
  function texture(w, h, paint, srgb = true) {
    const surface = document.createElement('canvas'); surface.width = w; surface.height = h;
    paint(surface.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(surface); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); textures.add(t); return t;
  }
  function random(seed) { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; }
  function hash(value) { let n = 17; for (const c of String(value)) n = Math.imul(n, 31) + c.charCodeAt(0) | 0; return n >>> 0; }
  const woodMap = texture(512, 512, (c, w, h) => {
    c.fillStyle = '#ac8458'; c.fillRect(0, 0, w, h); const rnd = random(40);
    for (let i = 0; i < 620; i++) { const y = rnd() * h; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * .3, y + rnd() * 11, w * .7, y - rnd() * 11, w, y + rnd() * 4); c.strokeStyle = i % 4 ? '#51351b15' : '#f6d8a12b'; c.lineWidth = .3 + rnd() * 1.5; c.stroke(); }
    for (let i = 1; i < 5; i++) { c.fillStyle = '#3e2b1720'; c.fillRect(0, i * h / 5, w, 1); }
  });
  woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping;
  const fabricMap = texture(128, 128, (c, w, h) => {
    c.fillStyle = '#a1a7a7'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { c.fillStyle = (x + y) % 4 ? '#c5cac9' : '#838a8b'; c.fillRect(x, y, 1, 1); }
  });
  fabricMap.wrapS = fabricMap.wrapT = THREE.RepeatWrapping; fabricMap.repeat.set(3, 3);
  const carpetMap = texture(256, 256, (c, w, h) => { const rnd = random(102); c.fillStyle = '#a5aaa8'; c.fillRect(0, 0, w, h); for (let i = 0; i < 15000; i++) { c.fillStyle = rnd() > .5 ? '#ffffff12' : '#12282918'; c.fillRect(rnd() * w, rnd() * h, 1, 2); } });
  carpetMap.wrapS = carpetMap.wrapT = THREE.RepeatWrapping; carpetMap.repeat.set(8, 12);
  const oak = mat('#d2ae7b', {map: woodMap, bumpMap: woodMap, bumpScale: .006, roughness: .33});
  const darkOak = mat('#5d4631', {map: woodMap, roughness: .49});
  const stone = mat('#e6e4dc', {roughness: .77});
  const wall = mat('#dfded7', {roughness: .92});
  const dark = mat('#151e24', {roughness: .49});
  const brushed = mat('#89949c', {metalness: .88, roughness: .25});
  const blackMetal = mat('#263137', {metalness: .76, roughness: .29});
  const cloth = mat('#4b5d63', {map: fabricMap, bumpMap: fabricMap, bumpScale: .008, roughness: .98});
  const lightCloth = mat('#b8c1bd', {map: fabricMap, bumpMap: fabricMap, bumpScale: .006, roughness: .92});
  const acoustic = mat('#5d6a69', {map: fabricMap, roughness: .95});
  const warmLed = mat('#fff1cc', {emissive: '#ffdaa0', emissiveIntensity: 2.2, roughness: .2});
  const blueLed = mat('#88efff', {emissive: '#35c6e4', emissiveIntensity: 1.7});
  const glass = mat('#b6d2db', {transparent: true, opacity: .18, metalness: .18, roughness: .13, depthWrite: false, side: THREE.DoubleSide});
  const screenBlack = mat('#081521', {metalness: .2, roughness: .25});
  const white = mat('#ebece9', {roughness: .49});

  // Small, locally generated studio map makes the glazing and metal read as surfaces.
  const studio = new THREE.Scene(); studio.background = new THREE.Color('#b6c6ca');
  const studioItems = [];
  for (const [x, y, z, w, h, color] of [[0, 12, 0, 9, 15, '#fff3db'], [14, 4, -2, 10, 10, '#d1edff'], [-12, 3, -5, 10, 6, '#fff0d5']]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color, side: THREE.DoubleSide})); mesh.position.set(x, y, z); mesh.lookAt(0, 0, 0); studio.add(mesh); studioItems.push(mesh);
  }
  const pmrem = new THREE.PMREMGenerator(renderer); const environment = pmrem.fromScene(studio, .08, .1, 70); pmrem.dispose(); extras.add(environment);
  for (const mesh of studioItems) { mesh.geometry.dispose(); mesh.material.dispose(); }
  scene.environment = environment.texture; scene.environmentIntensity = .6;
  scene.add(new THREE.HemisphereLight('#d5ebff', '#a29074', 1.5));
  const sun = new THREE.DirectionalLight('#fff0d8', 3.0); sun.position.set(8, 12, 1); sun.castShadow = !lowPower;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, {left: -9, right: 9, top: 13, bottom: -13, near: 1, far: 40}); sun.shadow.normalBias = .025; sun.shadow.bias = -.0002; scene.add(sun);
  const fill = new THREE.DirectionalLight('#d0eaff', 1.0); fill.position.set(-7, 5, 8); scene.add(fill);

  // Architecture, daylight and an office beyond the glass partition.
  box(room, mat('#7e8988', {map: carpetMap, roughness: .96}), 0, -.09, 0, 14.4, .18, 20);
  box(room, wall, 0, 2.15, -9.8, 14.4, 4.3, .2);
  box(room, wall, 0, 2.15, 9.8, 14.4, 4.3, .2);
  box(room, stone, 0, 4.35, 0, 14.4, .16, 20, false);
  for (const side of [-1, 1]) {
    box(room, dark, side * 7.05, .09, 0, .12, .18, 19.5);
    box(room, dark, side * 7.05, 4.17, 0, .12, .14, 19.5);
    for (let i = 0; i < 7; i++) {
      const z = -8.25 + i * 2.75;
      box(room, glass, side * 7.06, 2.12, z, .035, 3.95, 2.65, false);
      box(room, brushed, side * 7.06, 2.12, z - 1.35, .065, 4.1, .065);
      box(room, white, side * 7.04, 1.18, z, .04, .035, 2.65, false);
    }
  }
  for (let i = 0; i < 30; i++) box(room, darkOak, -5.8 + i * .4, 2.15, -9.61, .15, 4.2, .13);
  for (let i = 0; i < 8; i++) {
    const z = -7.8 + i * 2.2;
    round(room, acoustic, -7.0, 2.2, z, .12, 2.4, 1.6, false);
    box(room, dark, -7.02, 3.86, z, .1, .12, 1.65, false);
  }
  for (const x of [-4.5, 4.5]) for (const z of [-5.8, -.5, 5.0]) {
    box(room, dark, x, 4.18, z, .65, .1, 3.9, false);
    box(room, warmLed, x, 4.11, z, .47, .025, 3.65, false);
  }
  for (const x of [-1.5, 1.5]) for (const z of [-6, 0, 6]) {
    box(room, dark, x, 4.23, z, .7, .04, 1.3, false);
    for (let i = 0; i < 9; i++) box(room, brushed, x - .3 + i * .075, 4.205, z, .025, .01, 1.2, false);
  }
  const city = new THREE.Group(); room.add(city);
  const rndCity = random(92);
  for (let i = 0; i < 18; i++) {
    const x = 10 + rndCity() * 28, z = -27 + rndCity() * 48, h = 3 + rndCity() * 13;
    const building = mat(i % 2 ? '#a8bac5' : '#becbd0', {roughness: .8});
    box(city, building, x, h / 2 - 3.5, z, 2.5 + rndCity() * 3, h, 3.5, false);
    for (let y = -2.5; y < h - 3.5; y += 1.05) box(city, glass, x - 1.8, y, z, .035, .6, 3.3, false);
  }
  box(room, mat('#d6e0dd', {roughness: .89}), -9.7, -.02, 0, 5.1, .12, 20);
  for (const z of [-5, 0, 5]) { box(room, oak, -10, .75, z, 2.1, .08, 1.1); box(room, blackMetal, -10, .4, z, .12, .7, .12); round(room, dark, -10, 1.15, z - .3, .85, .48, .055); }
  // The entry door sits behind the left-hand chairs. It is visual only.
  box(room, brushed, -7.0, 2.05, 7.3, .09, 4.05, .07); box(room, brushed, -7.0, 2.05, 9.0, .09, 4.05, .07);
  const handle = tube(room, brushed, -6.93, 1.13, 7.53, .024, .42); handle.rotation.x = Math.PI / 2;
  for (const z of [-8.2, 8.2]) {
    tube(room, stone, 5.9, .25, z, .37, .5);
    for (let i = 0; i < 9; i++) { const angle = i * 2.4; const leaf = ball(room, mat(i % 2 ? '#496f4c' : '#69875a', {roughness: .82}), 5.9 + Math.sin(angle) * .28, .85 + i * .1, z + Math.cos(angle) * .23, .16, .48, .09, false); leaf.rotation.set(.25 * Math.sin(angle), angle, .5 * Math.cos(angle)); }
  }
  // Conference table: book-matched timber, bevelled edge, cable wells and steel trestles.
  round(room, darkOak, 0, .75, -.2, 3.72, .14, 12.9);
  round(room, oak, 0, .84, -.2, 3.72, .09, 12.9);
  box(room, darkOak, 0, .892, -.2, .025, .002, 12.4, false);
  for (const z of [-4.8, -.2, 4.4]) {
    round(room, blackMetal, 0, .38, z, .45, .73, 1.35); round(room, brushed, 0, .05, z, 2.2, .07, .9);
  }
  for (const z of [-4, 0, 3.8]) {
    round(room, blackMetal, 0, .901, z, .4, .022, .75); round(room, brushed, 0, .917, z, .3, .012, .59);
    for (const dz of [-.12, .12]) box(room, dark, 0, .926, z + dz, .13, .006, .06);
  }

  function chair(parent, x, z, angle) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = angle; parent.add(group);
    tube(group, brushed, 0, .27, 0, .035, .42); tube(group, dark, 0, .4, 0, .065, .17);
    for (let i = 0; i < 5; i++) { const leg = box(group, brushed, 0, .095, 0, .055, .045, .65); leg.rotation.y = i * Math.PI * 2 / 5; const wheel = ball(group, dark, Math.sin(i * Math.PI * 2 / 5) * .29, .065, Math.cos(i * Math.PI * 2 / 5) * .29, .055, .055, .034); wheel.rotation.y = i; }
    round(group, cloth, 0, .51, 0, .65, .14, .62);
    const back = round(group, cloth, 0, .99, -.27, .66, .93, .13); back.rotation.x = -.09;
    round(group, blackMetal, 0, .97, -.345, .58, .81, .06);
    round(group, cloth, 0, 1.44, -.31, .46, .2, .12);
    for (const side of [-1, 1]) { round(group, blackMetal, side * .37, .77, .015, .075, .07, .46); box(group, brushed, side * .33, .65, -.08, .03, .23, .03); }
    return group;
  }
  const seatPositions = [];
  // First sixteen participants face the table. The remaining roster uses the
  // perimeter seating, which keeps every saved employee present without overlap.
  for (let i = 0; i < 8; i++) for (const side of [-1, 1]) seatPositions.push({x: side * 2.36, z: 4.8 - i * 1.46, angle: side < 0 ? Math.PI / 2 : -Math.PI / 2, tier: 0});
  for (let i = 0; i < 9; i++) for (const side of [-1, 1]) seatPositions.push({x: side * 4.85, z: 5.15 - i * 1.51, angle: side < 0 ? Math.PI / 2 : -Math.PI / 2, tier: 1});
  seatPositions.push({x: -.88, z: -7.4, angle: 0, tier: 1}, {x: .88, z: -7.4, angle: 0, tier: 1});
  for (const seat of seatPositions) chair(room, seat.x, seat.z, seat.angle);
  chair(room, 0, 7.47, Math.PI);
  // Meeting technology uses a familiar wide video-bar and angled tablet form.
  // It is a local scene control, with no connection to a physical device.
  round(room, dark, 0, 2.42, -9.38, 6.1, 2.82, .13);
  const displayTexture = texture(1024, 512, () => {});
  const displayMaterial = basic({map: displayTexture, toneMapped: false});
  const display = shape(room, planeGeo, displayMaterial, 0, 2.42, -9.3, 5.84, 2.57, 1, false);
  display.userData.action = 'board'; interactives.push(display);
  round(room, dark, 0, .99, -9.14, 2.47, .225, .19);
  const grilleMap = texture(512, 64, (c, w, h) => { c.fillStyle = '#293237'; c.fillRect(0, 0, w, h); c.fillStyle = '#0d1417'; for (let y = 3; y < h; y += 5) for (let x = 3; x < w; x += 5) { c.beginPath(); c.arc(x + (y % 2) * 2, y, .9, 0, Math.PI * 2); c.fill(); } });
  const grille = mat('#c0c6c6', {map: grilleMap, roughness: .89});
  round(room, grille, 0, 1.0, -9.024, 2.3, .16, .035);
  for (const x of [-.12, .12]) { const lens = tube(room, blackMetal, x, 1.015, -8.991, .065, .03); lens.rotation.x = Math.PI / 2; const glassLens = tube(room, mat('#18334b', {metalness: .8, roughness: .08}), x, 1.015, -8.97, .043, .007); glassLens.rotation.x = Math.PI / 2; ball(room, blueLed, x - .01, 1.033, -8.963, .009, .009, .004, false); }
  box(room, blueLed, 0, 1.106, -9.005, .16, .008, .008, false);
  const tablet = new THREE.Group(); tablet.position.set(.64, .99, 5.15); tablet.rotation.x = -.88; tablet.rotation.z = -.06; room.add(tablet);
  round(room, brushed, .64, .926, 5.19, .64, .045, .42);
  round(room, blackMetal, .64, .95, 5.02, .27, .09, .06);
  round(tablet, dark, 0, .06, 0, .73, .47, .035);
  const tabletTexture = texture(512, 320, () => {});
  const tabletScreen = shape(tablet, planeGeo, basic({map: tabletTexture, toneMapped: false}), 0, .06, .02, .66, .395, 1, false);
  tabletScreen.userData.action = 'tablet'; interactives.push(tabletScreen);
  // Objects at the CEO's place anchor the camera in a real seated position.
  const paper = mat('#ecebe0', {roughness: .93});
  round(room, darkOak, -.4, .909, 5.12, .82, .025, .98);
  const note = shape(room, planeGeo, basic({map: texture(512, 512, (c, w, h) => { c.fillStyle = '#f0eee5'; c.fillRect(0, 0, w, h); c.fillStyle = '#384b51'; c.font = 'bold 30px system-ui'; c.fillText('CEO NOTES', 40, 65); c.fillStyle = '#708188'; c.font = '18px system-ui'; c.fillText('A clear decision. A useful next step.', 40, 105); c.strokeStyle = '#b9c2bf'; for (let y = 155; y < h - 20; y += 35) { c.beginPath(); c.moveTo(40, y); c.lineTo(w - 40, y); c.stroke(); } }), side: THREE.DoubleSide}), -.4, .925, 5.12, .73, .87, 1, false); note.rotation.x = -Math.PI / 2;
  const pen = tube(room, blackMetal, -.93, .93, 5.0, .013, .61); pen.rotation.x = Math.PI / 2; pen.rotation.z = .12;
  tube(room, white, 1.19, .99, 4.54, .11, .22); tube(room, darkOak, 1.19, 1.105, 4.54, .086, .008);
  const cupHandle = new THREE.Mesh(keepGeo(new THREE.TorusGeometry(.072, .018, 7, 16)), white); cupHandle.position.set(1.315, 1.01, 4.54); room.add(cupHandle);
  const carafe = tube(room, glass, -.1, 1.08, -1.7, .1, .38); tube(room, brushed, -.1, 1.29, -1.7, .065, .045);
  for (const z of [-3.4, 1.9]) for (const x of [-1.31, 1.31]) { round(room, paper, x, .904, z, .37, .008, .49); const water = tube(room, glass, x, .99, z - .41, .06, .17); water.receiveShadow = false; }

  const skinTones = ['#a66d4e', '#d6a185', '#70452f', '#bb8666', '#e0b89c', '#895d44'];
  const shirtColors = ['#354d66', '#536d65', '#3a414d', '#887a64', '#715c70', '#546873'];
  const skinMaterials = skinTones.map(color => mat(color, {roughness: .72}));
  const hairMaterials = ['#1b1817', '#33251c', '#615247', '#898780'].map(color => mat(color, {roughness: .94}));
  const suitMaterials = shirtColors.map(color => mat(color, {map: fabricMap, roughness: .91}));
  const trouserMaterials = [mat('#263039', {roughness: .93}), mat('#43484b', {roughness: .9}), mat('#494340', {roughness: .94})];
  const soleMaterial = mat('#13191d', {roughness: .54});
  const eyeMaterial = mat('#ede8dd', {roughness: .33}); const pupilMaterial = mat('#19272b', {roughness: .2});
  const mouthMaterial = mat('#56362f', {roughness: .84});
  const fingerGeo = (() => {
    // A single shared hand geometry includes a palm, thumb and four fingers.
    // Combining these vertices keeps fingers from multiplying every frame's draws.
    const pieces = [], temp = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3(), rot = new THREE.Quaternion();
    for (const [x, y, z, w, h, d, angle] of [[0, 0, 0, .043, .025, .07, 0], [-.042, -.004, .014, .018, .019, .048, -.56], [-.031, 0, .082, .012, .014, .044, -.05], [-.009, 0, .091, .012, .014, .05, 0], [.014, 0, .086, .011, .013, .045, .035], [.034, -.002, .073, .01, .012, .035, .09]]) {
      const g = sphereGeo.clone().toNonIndexed(); pos.set(x, y, z); scale.set(w, h, d); rot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle); temp.compose(pos, rot, scale); g.applyMatrix4(temp); pieces.push(g);
    }
    const positions = [], normals = []; for (const g of pieces) { positions.push(...g.attributes.position.array); normals.push(...g.attributes.normal.array); g.dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); return keepGeo(g);
  })();
  function limb(parent, material, x, y, z, radius, length, angle = 0) {
    const joint = new THREE.Group(); joint.position.set(x, y, z); joint.rotation.x = angle; parent.add(joint); ball(joint, material, 0, -length / 2, 0, radius, length / 2 + radius * .25, radius); return joint;
  }
  function person(employee, index, hologram = false) {
    const seed = hash(employee.id), skin = skinMaterials[seed % skinMaterials.length], suit = suitMaterials[seed % suitMaterials.length];
    const group = new THREE.Group(), body = new THREE.Group(); group.add(body); workforce.add(group);
    const legs = [], arms = [], hands = [], pants = trouserMaterials[seed % 3];
    round(body, pants, 0, .59, 0, .37, .24, .25);
    const torso = round(body, suit, 0, .98, -.015, .44, .57, .25); torso.rotation.x = -.04;
    const collar = round(body, white, 0, 1.24, .065, .19, .07, .13); collar.rotation.z = .02;
    for (const side of [-1, 1]) { const lapel = box(body, suit, side * .075, 1.16, .127, .07, .19, .025); lapel.rotation.z = side * -.26; }
    box(body, dark, 0, 1.12, .149, .036, .22, .014);
    tube(body, skin, 0, 1.3, 0, .065, .14);
    const head = new THREE.Group(); head.position.set(0, 1.49, .018); body.add(head);
    ball(head, skin, 0, 0, 0, .145, .184, .143);
    for (const side of [-1, 1]) { ball(head, skin, side * .145, -.004, 0, .028, .049, .021); const eye = ball(head, eyeMaterial, side * .058, .021, .129, .028, .012, .009, false); ball(head, pupilMaterial, side * .057, .021, .137, .010, .010, .005, false); const brow = box(head, hairMaterials[seed % 4], side * .058, .053, .129, .065, .011, .01, false); brow.rotation.z = side * -.09; }
    ball(head, skin, 0, -.01, .148, .025, .047, .03);
    const mouth = round(head, mouthMaterial, 0, -.083, .131, .062, .012, .008, false);
    // Hair caps, partings and optional glasses differ deterministically per ID.
    shape(head, hairGeo, hairMaterials[seed % 4], 0, .014, -.006, .151, .182, .149);
    if (seed % 5 === 0) for (const side of [-1, 1]) { const lens = new THREE.Mesh(glassesGeo, brushed); lens.position.set(side * .058, .02, .143); head.add(lens); }
    if (seed % 5 === 0) box(head, brushed, 0, .025, .145, .045, .005, .005, false);
    for (const side of [-1, 1]) {
      const upper = limb(body, suit, side * .258, 1.2, -.005, .065, .28, -.12); arms.push(upper);
      const fore = limb(upper, suit, 0, -.27, 0, .052, .26, -1.13); arms.push(fore);
      const hand = shape(fore, fingerGeo, skin, 0, -.29, 0, 1, 1, 1); hand.rotation.x = Math.PI / 2; hands.push(hand);
      const leg = limb(body, pants, side * .105, .59, .005, .078, .37, -Math.PI / 2); legs.push(leg);
      const shin = limb(leg, pants, 0, -.35, 0, .064, .44, Math.PI / 2); legs.push(shin);
      round(shin, soleMaterial, 0, -.44, .075, .14, .1, .28);
    }
    const hit = box(group, basic({visible: false}), 0, 1.0, 0, .8, 1.7, .7, false); hit.userData.action = employee.id; interactives.push(hit);
    const actor = {group, body, head, mouth, legs, arms, hands, employee, index, phase: 'Invited', progress: 0, wait: 0, label: null, hologram};
    actors.set(employee.id, actor); return actor;
  }
  // The visible CEO forearms are camera-relative, with cuffs, wrists and fingers.
  const ceo = new THREE.Group(); camera.add(ceo);
  const ceoSkin = mat('#9d684b', {roughness: .7}), ceoSleeve = mat('#243b4d', {map: fabricMap, roughness: .9});
  for (const side of [-1, 1]) {
    const forearm = new THREE.Group(); forearm.position.set(side * .32, -.37, -.8); forearm.rotation.set(.08, side * -.19, side * -.19); ceo.add(forearm);
    ball(forearm, ceoSleeve, 0, 0, .02, .087, .072, .3, false);
    round(forearm, white, 0, .005, -.23, .145, .09, .05, false);
    ball(forearm, ceoSkin, 0, .006, -.3, .066, .037, .12, false);
    const hand = shape(forearm, fingerGeo, ceoSkin, 0, .006, -.41, 1.28, 1.12, 1.22, false); hand.rotation.y = Math.PI;
    if (side < 0) { const watch = round(forearm, blackMetal, 0, .042, -.27, .089, .02, .09, false); round(forearm, screenBlack, 0, .055, -.27, .067, .008, .066, false); }
  }

  // A faceless dark-metal assistant is a local installation rather than a
  // proprietary character costume. Its optional employee target is supplied by state.
  const installation = new THREE.Group(); installation.position.set(4.98, 0, -8.2); room.add(installation);
  round(installation, dark, 0, .2, 0, 1.25, .4, 1.25);
  const ring = new THREE.Mesh(keepGeo(new THREE.TorusGeometry(.44, .022, 8, 36)), blueLed); ring.rotation.x = Math.PI / 2; ring.position.y = .415; installation.add(ring);
  const hologramMat = mat('#28333c', {metalness: .92, roughness: .22, emissive: '#173346', emissiveIntensity: .28});
  const hologram = new THREE.Group(); hologram.position.y = .5; installation.add(hologram);
  round(hologram, hologramMat, 0, .74, 0, .49, .7, .25);
  ball(hologram, hologramMat, 0, 1.25, 0, .145, .195, .142);
  for (const side of [-1, 1]) { ball(hologram, hologramMat, side * .3, .73, 0, .075, .3, .07); ball(hologram, hologramMat, side * .14, .18, 0, .09, .37, .095); }
  for (let i = 0; i < 6; i++) { const line = box(hologram, blueLed, 0, .53 + i * .093, .13, .34 - i * .025, .007, .008, false); line.rotation.z = i % 2 ? .09 : -.09; }
  const assistantHit = box(installation, basic({visible: false}), 0, 1.14, 0, .9, 1.7, .8, false); assistantHit.userData.action = 'assistant'; interactives.push(assistantHit);
  let assistantId = null;

  // Static parts are instanced by geometry/material, retaining movable people
  // and unique screen textures. This caps draw calls without fetched assets.
  function batchStatic(root) {
    root.updateWorldMatrix(true, true); const batches = new Map();
    root.traverse(item => { let withinInstallation = false; for (let p = item; p && p !== root; p = p.parent) if (p === installation) withinInstallation = true;
      if (!item.isMesh || withinInstallation || item === tabletScreen || !item.material || Array.isArray(item.material) || item.material.transparent || item.userData.action) return; const key = item.geometry.uuid + ':' + item.material.uuid; if (!batches.has(key)) batches.set(key, []); batches.get(key).push(item); });
    const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert(), matrix = new THREE.Matrix4();
    for (const items of batches.values()) { if (items.length < 4) continue; const instanced = new THREE.InstancedMesh(items[0].geometry, items[0].material, items.length); instanced.castShadow = items.some(i => i.castShadow); instanced.receiveShadow = true;
      items.forEach((item, i) => { matrix.multiplyMatrices(inverse, item.matrixWorld); instanced.setMatrixAt(i, matrix); item.removeFromParent(); }); instanced.instanceMatrix.needsUpdate = true; root.add(instanced);
    }
  }
  batchStatic(room);

  // Body transforms remain in their logical skeletons for walking and speech;
  // one instance list per shared surface renders the entire employee roster.
  function rebuildAvatarBatches() {
    for (const batch of avatarBatches) { batch.mesh.removeFromParent(); batch.mesh.dispose(); }
    const groups = new Map();
    for (const actor of actors.values()) actor.group.traverse(item => {
      if (!item.isMesh || item.userData.action) return;
      const key = item.geometry.uuid + ':' + item.material.uuid;
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push({item, actor}); item.visible = false;
    });
    avatarBatches = [];
    for (const entries of groups.values()) {
      const mesh = new THREE.InstancedMesh(entries[0].item.geometry, entries[0].item.material, entries.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
      mesh.castShadow = true; mesh.receiveShadow = true; avatarInstances.add(mesh); avatarBatches.push({mesh, entries});
    }
  }
  const invisibleMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  function updateAvatarMatrices() {
    workforce.updateMatrixWorld(true);
    for (const {mesh, entries} of avatarBatches) {
      entries.forEach(({item, actor}, index) => mesh.setMatrixAt(index, actor.group.visible ? item.matrixWorld : invisibleMatrix));
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function paintScreen(state) {
    const meeting = state.meeting || {}, chair = chairPresentation(state), selectedName = actors.get(chair.selectedEmployeeId)?.employee.name;
    const next = JSON.stringify([state.company?.name, meeting.id, meeting.status, meeting.title, chair, voiceAgent, voiceSpeaking, paused]);
    if (next === labelSignature) return; labelSignature = next;
    const c = displayTexture.image.getContext('2d'), w = displayTexture.image.width, h = displayTexture.image.height;
    const bg = c.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#102b3a'); bg.addColorStop(1, '#071722'); c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = '#65d8d4'; c.fillRect(54, 43, 34, 4); c.font = '600 19px system-ui'; c.fillText('MEETING BOARD · YOU LEAD', 54, 84);
    c.fillStyle = '#b8cdd0'; c.font = '20px system-ui'; fitText(c, String(state.company?.name || 'Your company'), 54, 121, w - 108, 20);
    c.fillStyle = '#eff4ef'; c.font = '600 42px system-ui'; wrapText(c, chair.topic, 54, 186, w - 108, 49, 2);
    c.fillStyle = '#70dfc2'; c.font = '600 25px system-ui'; fitText(c, chair.status, 54, 292, w - 108, 25);
    c.fillStyle = '#c2d5da'; c.font = '23px system-ui'; fitText(c, voiceSpeaking && voiceAgent ? 'Reply playing: ' + (actors.get(voiceAgent)?.employee.name || voiceAgent) : selectedName ? 'Selected: ' + selectedName : 'Colleagues wait until you call on them.', 54, 330, w - 108, 23);
    c.fillStyle = '#9ebbc2'; c.font = '20px system-ui'; fitText(c, chair.answer ? 'Saved reply: ' + chair.answer : chair.question ? 'Your question: ' + chair.question : 'Choose a colleague or address them by name.', 54, 372, w - 108, 20);
    c.fillStyle = '#226e78'; c.beginPath(); c.roundRect(54, 410, w - 108, 62, 10); c.fill(); c.fillStyle = '#efffff'; c.font = '600 25px system-ui'; c.fillText(chair.boardOpen ? 'MEETING BOARD IS OPEN' : 'OPEN MEETING BOARD  →', 80, 451); displayTexture.needsUpdate = true;
    const t = tabletTexture.image.getContext('2d'), tw = tabletTexture.image.width, th = tabletTexture.image.height;
    t.fillStyle = '#112a36'; t.fillRect(0, 0, tw, th); t.fillStyle = '#b8e3e0'; t.font = '600 24px system-ui'; t.fillText('YOUR MEETING', 29, 52);
    t.fillStyle = '#ecf4ef'; t.font = '600 28px system-ui'; wrapText(t, chair.topic, 29, 107, tw - 58, 34, 2);
    t.font = '21px system-ui'; t.fillStyle = '#b1c9d2'; fitText(t, chair.status, 29, 184, tw - 58, 21);
    t.fillStyle = '#226e78'; t.beginPath(); t.roundRect(29, 218, tw - 58, 68, 12); t.fill(); t.fillStyle = '#ffffff'; t.font = '600 25px system-ui'; fitText(t, chair.boardOpen ? 'Meeting board open' : 'Open meeting board', 51, 261, tw - 102, 25); tabletTexture.needsUpdate = true;
  }
  function chairPresentation(state) {
    const chair = state.chair || {}, meeting = state.meeting || {}, clean = (value, max) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
    return {selectedEmployeeId: typeof chair.selectedEmployeeId === 'string' && actors.has(chair.selectedEmployeeId) ? chair.selectedEmployeeId : null, topic: clean(chair.topic || meeting.agenda?.[0] || meeting.title || 'What would you like to discuss?', 220), status: clean(chair.status || (activeMeeting ? 'You have the floor' : meeting.status === 'Ended' ? 'Meeting ended · saved for review' : 'Start when you are ready'), 140), boardOpen: chair.boardOpen === true, question: clean(chair.question, 180), answer: clean(chair.answer, 180)};
  }
  function wrapText(c, value, x, y, width, lineHeight, maxLines) {
    const words = String(value).split(/\s+/); let line = '', row = 0;
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (line && c.measureText(next).width > width) { c.fillText(line, x, y + row * lineHeight, width); line = word; row++; if (row >= maxLines) return; } else line = next;
    }
    if (line && row < maxLines) c.fillText(line, x, y + row * lineHeight, width);
  }
  function fitText(c, value, x, y, width, size) { while (size > 15 && c.measureText(value).width > width) { size--; c.font = `600 ${size}px system-ui`; } c.fillText(value, x, y, width); }
  let currentState = {};
  function actorLabel(actor) {
    const old = actor.label;
    const selected = currentState.chair?.selectedEmployeeId === actor.employee.id;
    const map = old?.material.map || texture(384, 80, () => {}), c = map.image.getContext('2d'), w = map.image.width, h = map.image.height;
    c.clearRect(0, 0, w, h); c.fillStyle = selected ? '#153e45f2' : '#10232be8'; c.beginPath(); c.roundRect(0, 0, w, h, 15); c.fill();
    if (selected) { c.strokeStyle = '#83e3d4'; c.lineWidth = 4; c.stroke(); }
    c.textAlign = 'center'; c.fillStyle = '#edf4ee'; c.font = '600 27px system-ui'; fitText(c, String(actor.employee.name), w / 2, 34, w - 20, 27); c.fillStyle = selected ? '#b8f2e8' : '#a6c6ca'; c.font = '16px system-ui';
    c.fillText(actor.phase === 'Seated' ? voiceSpeaking && voiceAgent === actor.employee.id ? 'Saved reply playing' : selected ? 'Selected by CEO' : 'Ready · waiting for CEO' : actor.phase + ' · avatar', w / 2, 62, w - 16); map.needsUpdate = true;
    if (old) return;
    const material = new THREE.SpriteMaterial({map, transparent: true, depthWrite: false, toneMapped: false}); materials.add(material);
    const label = new THREE.Sprite(material); label.position.set(0, 1.93, 0); label.scale.set(1.03, .215, 1); actor.group.add(label); actor.label = label;
  }
  function setPhase(actor, phase) { if (actor.phase === phase) return; actor.phase = phase; actorLabel(actor); onArrival?.(actor.employee.id, phase); labelSignature = ''; shadowsDirty = dirty = true; }
  function seatedPose(actor, seated) {
    const [l1, l2, r1, r2] = actor.legs;
    l1.rotation.x = r1.rotation.x = seated ? -Math.PI / 2 : 0;
    l2.rotation.x = r2.rotation.x = seated ? Math.PI / 2 : 0;
    actor.body.position.y = seated ? 0 : .35;
    actor.arms.forEach((arm, i) => { arm.rotation.x = seated ? (i % 2 ? -1.13 : -.12) : 0; });
  }
  function settle(actor) {
    const seat = seatPositions[actor.index]; actor.group.position.set(seat.x, 0, seat.z); actor.group.rotation.y = seat.angle;
    actor.group.visible = activeMeeting; seatedPose(actor, true); setPhase(actor, 'Seated');
  }
  function beginArrival(actor, index) {
    actor.progress = 0; actor.wait = index * .43; actor.group.visible = false; actor.group.position.set(-6.6, 0, 7.85);
    seatedPose(actor, false); setPhase(actor, 'Invited');
    if (reduced.matches) settle(actor);
  }
  function normalizeParticipants(state) {
    const roster = Array.isArray(state.employees) ? state.employees : [], listed = state.meeting?.participants ?? state.meeting?.employeeIds;
    const ids = Array.isArray(listed) ? new Set(listed.map(p => typeof p === 'string' ? p : p?.id || p?.agent || p?.employeeId).filter(Boolean)) : null;
    return roster.filter(e => e && typeof e.id === 'string' && (!ids || ids.has(e.id))).slice(0, seatPositions.length);
  }
  function update(state = {}) {
    if (disposed) return; currentState = state;
    const meeting = state.meeting || {}, roster = normalizeParticipants(state), nextRoster = JSON.stringify(roster.map(e => [e.id, e.name]));
    const wasActive = activeMeeting; activeMeeting = meeting.status === 'Active';
    paused = !!(meeting.paused || state.motionPaused || state.paused);
    voiceAgent = state.voice?.speakingAgent || null; voiceSpeaking = !!voiceAgent && state.voice?.speaking !== false;
    assistantId = state.assistantId || state.employees?.find(e => /black\s*panther/i.test(e.name || '') || /black\s*panther/i.test(e.id))?.id || null;
    installation.visible = !!assistantId;
    const nextKey = activeMeeting ? String(meeting.id || meeting.invitedAt || meeting.startedAt || 'active') : '';
    const newInvite = activeMeeting && (!wasActive || nextKey !== inviteKey);
    if (nextRoster !== rosterSignature) {
      const wanted = new Set(roster.map(e => e.id));
      for (const [id, actor] of actors) if (!wanted.has(id)) removeActor(id, actor);
      roster.forEach((employee, index) => {
        let actor = actors.get(employee.id);
        if (!actor) { actor = person(employee, index); actor.group.visible = false; actorLabel(actor); if (activeMeeting && !newInvite) beginArrival(actor, index); }
        actor.index = index;
        if (actor.employee.name !== employee.name) { actor.employee = employee; actorLabel(actor); } else actor.employee = employee;
        if (activeMeeting && actor.phase === 'Seated') settle(actor);
      }); rosterSignature = nextRoster; rebuildAvatarBatches(); shadowsDirty = true;
    }
    if (newInvite) for (const actor of actors.values()) beginArrival(actor, actor.index);
    if (!activeMeeting) for (const actor of actors.values()) { actor.group.visible = false; setPhase(actor, 'Invited'); }
    inviteKey = nextKey;
    const nextChair = JSON.stringify([chairPresentation(state), voiceAgent, voiceSpeaking]);
    if (nextChair !== chairSignature) { chairSignature = nextChair; for (const actor of actors.values()) actorLabel(actor); }
    paintScreen(state); refreshTargets();
    const visual = JSON.stringify([nextRoster, nextKey, meeting.status, meeting.title, state.company?.name, paused, voiceAgent, voiceSpeaking, assistantId, chairSignature]);
    if (visual !== visualSignature) { visualSignature = visual; markDirty(); }
  }
  function removeActor(id, actor) {
    actor.group.removeFromParent(); actors.delete(id);
    const index = interactives.findIndex(item => item.userData.action === id); if (index >= 0) { const [hit] = interactives.splice(index, 1); hit.material.dispose(); materials.delete(hit.material); }
    if (actor.label) { actor.label.material.map.dispose(); textures.delete(actor.label.material.map); actor.label.material.dispose(); materials.delete(actor.label.material); }
  }

  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let targets = [], focusedAction = null, downPosition = null, dragged = false, pointerInside = false;
  function refreshTargets() {
    targets = ['tablet', ...[...actors.values()].filter(a => a.group.visible).map(a => a.employee.id), ...(assistantId ? ['assistant'] : []), 'board'];
    if (focusedAction && !targets.includes(focusedAction)) { focusedAction = null; focusIndex = -1; }
    if (focusedAction) focusIndex = targets.indexOf(focusedAction);
  }
  function interactiveVisible(item) { let parent = item; while (parent) { if (!parent.visible) return false; parent = parent.parent; } return true; }
  function hitAt(x, y) {
    const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return null;
    pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1); ray.setFromCamera(pointer, camera);
    return ray.intersectObjects(interactives.filter(interactiveVisible), false)[0]?.object || null;
  }
  function activate(action) { if (action === 'tablet' || action === 'board') (onBoard || onTablet)?.(); else if (action === 'assistant') { if (assistantId) onEmployee?.(assistantId); } else if (action) onEmployee?.(action); }
  function lookAtAction(action) {
    const item = interactives.find(i => i.userData.action === action); if (!item) return;
    const world = item.getWorldPosition(new THREE.Vector3()).sub(camera.position);
    yaw = THREE.MathUtils.clamp(Math.atan2(-world.x, -world.z), -1.42, 1.42);
    pitch = THREE.MathUtils.clamp(Math.atan2(world.y, Math.hypot(world.x, world.z)), -.7, .44);
    canvas.setAttribute('aria-label', action === 'tablet' || action === 'board' ? 'Meeting board selected. Press Enter to open. Arrow keys look. Tab selects a colleague. Escape leaves.' : `${actors.get(action)?.employee.name || 'Assistant'} selected. Press Enter to call on this colleague. Arrow keys look. Tab selects another control. Escape leaves.`); markDirty();
  }
  function listen(target, event, fn, options) { target.addEventListener(event, fn, options); events.push(() => target.removeEventListener(event, fn, options)); }
  listen(canvas, 'pointerdown', e => {
    if (e.button !== 0) return; canvas.focus({preventScroll: true}); pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    downPosition = {x: e.clientX, y: e.clientY}; dragged = false; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing';
  });
  listen(canvas, 'pointermove', e => {
    const previous = pointers.get(e.pointerId);
    if (!previous) { const hit = hitAt(e.clientX, e.clientY); canvas.style.cursor = hit ? 'pointer' : 'grab'; canvas.title = ['tablet', 'board'].includes(hit?.userData.action) ? 'Open your meeting board' : hit?.userData.action === 'assistant' ? 'Call on your assistant' : actors.has(hit?.userData.action) ? 'Call on ' + actors.get(hit.userData.action).employee.name : 'Drag to look around'; return; }
    if (downPosition && Math.hypot(e.clientX - downPosition.x, e.clientY - downPosition.y) > 5) dragged = true;
    const dx = e.clientX - previous.x, dy = e.clientY - previous.y; pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    yaw = THREE.MathUtils.clamp(yaw - dx * .0031, -1.42, 1.42); pitch = THREE.MathUtils.clamp(pitch - dy * .0028, -.7, .44); markDirty();
  });
  function release(e, cancelled = false) { if (!pointers.has(e.pointerId)) return; pointers.delete(e.pointerId); if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); canvas.style.cursor = 'grab'; if (!cancelled && !dragged) activate(hitAt(e.clientX, e.clientY)?.userData.action); downPosition = null; }
  listen(canvas, 'pointerup', e => release(e)); listen(canvas, 'pointercancel', e => release(e, true));
  listen(canvas, 'lostpointercapture', e => { pointers.delete(e.pointerId); });
  listen(canvas, 'pointerenter', () => { pointerInside = true; }); listen(canvas, 'pointerleave', () => { pointerInside = false; });
  listen(canvas, 'keydown', e => {
    const step = e.shiftKey ? .16 : .08;
    if (['ArrowLeft', 'a', 'A'].includes(e.key)) yaw += step;
    else if (['ArrowRight', 'd', 'D'].includes(e.key)) yaw -= step;
    else if (['ArrowUp', 'w', 'W'].includes(e.key)) pitch += step;
    else if (['ArrowDown', 's', 'S'].includes(e.key)) pitch -= step;
    else if (e.key === 'Home') { yaw = 0; pitch = -.065; }
    else if (e.key === 'Tab') {
      // One complete cycle returns focus to normal DOM controls, avoiding a trap.
      const next = focusIndex + (e.shiftKey ? -1 : 1);
      if (next < 0 || next >= targets.length) { focusIndex = -1; focusedAction = null; return; }
      focusIndex = next; focusedAction = targets[focusIndex]; lookAtAction(focusedAction);
    } else if (e.key === 'b' || e.key === 'B') activate('board');
    else if (e.key === 'Enter' || e.key === ' ') activate(focusedAction || 'tablet');
    else if (e.key === 'Escape') onExit?.(); else return;
    e.preventDefault(); yaw = THREE.MathUtils.clamp(yaw, -1.42, 1.42); pitch = THREE.MathUtils.clamp(pitch, -.7, .44); markDirty();
  });
  listen(canvas, 'blur', () => { focusIndex = -1; focusedAction = null; });

  function advance(actor, dt) {
    if (actor.phase === 'Seated') return false;
    if (reduced.matches) { settle(actor); return false; }
    if (actor.wait > 0) { actor.wait = Math.max(0, actor.wait - dt); return true; }
    if (actor.phase === 'Invited') { actor.group.visible = true; setPhase(actor, 'Arriving'); refreshTargets(); }
    const seat = seatPositions[actor.index];
    // Each avatar walks from the same room entrance along a side aisle, turns
    // toward its assigned chair, then settles. The table is never crossed.
    const side = seat.x < 0 ? -1 : 1, aisleX = seat.tier ? side * 5.9 : side * 3.42;
    const path = [new THREE.Vector3(-6.6, 0, 7.85), new THREE.Vector3(aisleX, 0, 7.0), new THREE.Vector3(aisleX, 0, seat.z), new THREE.Vector3(seat.x, 0, seat.z)];
    const lengths = path.slice(1).map((p, i) => p.distanceTo(path[i])), total = lengths.reduce((a, b) => a + b, 0);
    actor.progress += dt * 2.2; let distance = Math.min(actor.progress, total), segment = 0;
    while (segment < lengths.length - 1 && distance > lengths[segment]) { distance -= lengths[segment]; segment++; }
    actor.group.position.lerpVectors(path[segment], path[segment + 1], lengths[segment] ? distance / lengths[segment] : 1);
    const delta = path[segment + 1].clone().sub(path[segment]); actor.group.rotation.y = Math.atan2(delta.x, delta.z);
    actor.body.position.y = .35 + Math.sin(actor.progress * 10) * .015;
    actor.legs[0].rotation.x = Math.sin(actor.progress * 5.5) * .43; actor.legs[2].rotation.x = -Math.sin(actor.progress * 5.5) * .43;
    actor.legs[1].rotation.x = Math.max(0, -Math.sin(actor.progress * 5.5)) * .4; actor.legs[3].rotation.x = Math.max(0, Math.sin(actor.progress * 5.5)) * .4;
    actor.arms[0].rotation.x = -Math.sin(actor.progress * 5.5) * .18; actor.arms[2].rotation.x = Math.sin(actor.progress * 5.5) * .18;
    if (actor.progress >= total) { settle(actor); paintScreen(currentState); return false; } return true;
  }
  function visibleHost() { const rect = host.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }
  function runnable() { return enabled && !disposed && !document.hidden && !contextLost && inViewport && visibleHost(); }
  function markDirty() { if (disposed) return; dirty = true; if (!frame && runnable()) frame = requestAnimationFrame(render); }
  function render(time) {
    frame = 0; if (!runnable()) return;
    if (lastFrame && time - lastFrame < 32 && !dirty) { frame = requestAnimationFrame(render); return; }
    const dt = Math.min(.12, lastFrame ? (time - lastFrame) / 1000 : 0); lastFrame = time; let animating = false, walking = false;
    if (!paused) {
      elapsed += dt;
      if (activeMeeting) for (const actor of actors.values()) { if (advance(actor, dt)) animating = walking = true;
        const speaking = actor.phase === 'Seated' && voiceSpeaking && voiceAgent === actor.employee.id;
        actor.mouth.scale.y = speaking && !reduced.matches ? .012 * (1.2 + Math.abs(Math.sin(elapsed * 11)) * 2.3) : .012;
        if (speaking && !reduced.matches) { actor.head.rotation.z = Math.sin(elapsed * 2.2) * .025; animating = true; } else actor.head.rotation.z = 0;
      }
    }
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    if (dirty || animating) {
      updateAvatarMatrices(); renderer.shadowMap.needsUpdate = shadowsDirty || (walking && elapsed - lastShadow > .25);
      if (renderer.shadowMap.needsUpdate) lastShadow = elapsed;
      renderer.render(scene, camera); dirty = false; shadowsDirty = false;
    }
    if (animating) frame = requestAnimationFrame(render);
  }
  function resize() { if (disposed) return; const rect = host.getBoundingClientRect(); const width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height)); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); lastFrame = 0; markDirty(); }
  const observer = new ResizeObserver(resize); observer.observe(host);
  const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    inViewport = entries[0]?.isIntersecting !== false;
    if (!inViewport) { if (frame) cancelAnimationFrame(frame); frame = 0; lastFrame = 0; }
    else { lastFrame = 0; markDirty(); }
  }) : null;
  intersection?.observe(host);
  function visibility() { if (document.hidden) { if (frame) cancelAnimationFrame(frame); frame = 0; lastFrame = 0; } else { lastFrame = 0; markDirty(); } }
  listen(document, 'visibilitychange', visibility);
  listen(reduced, 'change', () => { if (reduced.matches && activeMeeting) for (const actor of actors.values()) settle(actor); refreshTargets(); paintScreen(currentState); markDirty(); });
  listen(canvas, 'webglcontextlost', e => { e.preventDefault(); contextLost = true; if (frame) cancelAnimationFrame(frame); frame = 0; });
  listen(canvas, 'webglcontextrestored', () => { contextLost = false; lastFrame = 0; shadowsDirty = true; markDirty(); });
  resize(); update({});
  return {
    update,
    setEnabled(value) { enabled = !!value; if (!enabled && frame) { cancelAnimationFrame(frame); frame = 0; } if (enabled) { lastFrame = 0; resize(); markDirty(); } },
    resetCamera() { yaw = 0; pitch = -.065; markDirty(); },
    // Read-only visual phases are deliberately distinct from employee work state.
    getPresentation() { return [...actors.values()].map(a => ({id: a.employee.id, phase: a.phase})); },
    dispose() {
      if (disposed) return; disposed = true; enabled = false; if (frame) cancelAnimationFrame(frame); frame = 0;
      observer.disconnect(); intersection?.disconnect(); for (const remove of events) remove(); events.length = 0; pointers.clear();
      scene.traverse(item => { if (item.isInstancedMesh) item.dispose(); });
      for (const g of geometry) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose(); for (const item of extras) item.dispose();
      sun.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); actors.clear(); interactives.length = 0;
    }
  };
}
