    let gameMode = 'practice';
    const ARENA_SIZE = 800;
    let scale = 1;

    const MATCH_DURATION = 60;
    let timeRemaining = MATCH_DURATION;
    let timerInterval = null;
    let isGameRunning = false;

    /* ----------------------------------------------------
       1. SYNTHESIZED AUDIO ENGINE
       ---------------------------------------------------- */
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playSound(type) {
        try {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            if (type === 'pickup') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
                gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
                osc.start(); osc.stop(audioCtx.currentTime + 0.1);
            } else if (type === 'shoot') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(250, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(700, audioCtx.currentTime + 0.15);
                gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
                gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
                osc.start(); osc.stop(audioCtx.currentTime + 0.15);
            } else if (type === 'score') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523, audioCtx.currentTime);
                osc.frequency.setValueAtTime(659, audioCtx.currentTime + 0.08);
                osc.frequency.setValueAtTime(783, audioCtx.currentTime + 0.16);
                gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
                gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
                osc.start(); osc.stop(audioCtx.currentTime + 0.3);
            } else if (type === 'gameover') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(600, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.6);
                gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
                gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
                osc.start(); osc.stop(audioCtx.currentTime + 0.6);
            }
        } catch(e) {}
    }

    /* ----------------------------------------------------
       2. IMAGE LOADER SYSTEM
       ---------------------------------------------------- */
    const images = {
        ftcCenter: new Image(),
        wattsUpLogo: new Image(),
        ftcLoaded: false,
        wattsUpLoaded: false
    };

    images.ftcCenter.src = "images/ftc-reference.png";
    images.wattsUpLogo.src = "images/watts-up-logo.png";

    images.ftcCenter.onload = () => { images.ftcLoaded = true; };
    images.wattsUpLogo.onload = () => { images.wattsUpLoaded = true; };

    /* ----------------------------------------------------
       3. CANVAS & GAME STATE CONFIGURATION
       ---------------------------------------------------- */
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // Proprietăți adăugate pentru fizica Mecanum (vx, vy, vRot)
    const p1 = {
        id: 'P1',
        x: 320,
        y: 650,
        vx: 0,
        vy: 0,
        vRot: 0,
        radius: 36,
        angle: -Math.PI / 2,
        maxSpeed: 4.6,
        accel: 0.4,
        friction: 0.88,
        color: '#ff6b00',
        inventory: 0,
        maxInventory: 3,
        score: 0,
        label: "#16166"
    };

    const p2 = {
        id: 'P2',
        x: 480,
        y: 650,
        vx: 0,
        vy: 0,
        vRot: 0,
        radius: 36,
        angle: -Math.PI / 2,
        maxSpeed: 4.6,
        accel: 0.4,
        friction: 0.88,
        color: '#00d2ff',
        inventory: 0,
        maxInventory: 3,
        score: 0,
        label: "P2"
    };

    const highBasket = { x: 130, y: 130, radius: 45, pts: 100, label: "HIGH" };
    const lowBasket = { x: 670, y: 130, radius: 55, pts: 50, label: "LOW" };

    let artifacts = [];
    let projectiles = [];

    function spawnArtifacts() {
        artifacts = [];
        const colors = ['#ffd700', '#a855f7', '#ffd700', '#a855f7', '#ffd700', '#a855f7'];
        for (let i = 0; i < 6; i++) {
            let rx = 100 + Math.random() * 550;
            let ry = 220 + Math.random() * 480;
            artifacts.push({ id: i, x: rx, y: ry, radius: 12, color: colors[i], active: true });
        }
    }

    /* ----------------------------------------------------
       4. INPUT CONTROLS
       ---------------------------------------------------- */
    const keys = {};

    window.addEventListener('keydown', (e) => {
        if (!isGameRunning) return;
        keys[e.code] = true;
        if (e.code === 'Space') shootArtifact(p1);
        if ((e.code === 'Enter' || e.code === 'KeyM') && gameMode === '1v1') shootArtifact(p2);
    });

    window.addEventListener('keyup', (e) => {
        keys[e.code] = false;
    });

    let j1Vec = { x: 0, y: 0 };
    let j2Vec = { x: 0, y: 0 };

    function setupJoystick(baseId, knobId, setVec) {
        const base = document.getElementById(baseId), knob = document.getElementById(knobId);
        let touchId = null, center = { x: 0, y: 0 };
        const maxD = 40;
        const move = t => {
            const dx = t.clientX - center.x, dy = t.clientY - center.y;
            const ang = Math.atan2(dy, dx), d = Math.min(Math.hypot(dx, dy), maxD);
            const mx = Math.cos(ang) * d, my = Math.sin(ang) * d;
            knob.style.transform = `translate(${mx}px, ${my}px)`;
            setVec({ x: mx / maxD, y: my / maxD });
        };
        const release = () => { touchId = null; knob.style.transform = 'translate(0px, 0px)'; setVec({ x: 0, y: 0 }); };
        base.addEventListener('touchstart', e => {
            if (!isGameRunning || touchId !== null) return;
            e.preventDefault();
            const t = e.changedTouches[0];
            touchId = t.identifier;
            const r = base.getBoundingClientRect();
            center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            move(t);
        }, { passive: false });
        window.addEventListener('touchmove', e => {
            if (touchId === null) return;
            for (const t of e.changedTouches) if (t.identifier === touchId) { e.preventDefault(); move(t); }
        }, { passive: false });
        const end = e => { for (const t of e.changedTouches) if (t.identifier === touchId) release(); };
        window.addEventListener('touchend', end);
        window.addEventListener('touchcancel', end);
    }
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

    setupJoystick('joy1-base', 'joy1-knob', v => j1Vec = v);
    setupJoystick('joy2-base', 'joy2-knob', v => j2Vec = v);

    function holdButton(id, player, val) {
        const el = document.getElementById(id);
        el.addEventListener('pointerdown', e => { e.preventDefault(); player.rotBtn = val; });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => { if (player.rotBtn === val) player.rotBtn = 0; }));
    }
    holdButton('rot-l-p1', p1, -1); holdButton('rot-r-p1', p1, 1);
    holdButton('rot-l-p2', p2, -1); holdButton('rot-r-p2', p2, 1);

    document.getElementById('btn-shoot-p1').addEventListener('touchstart', e => { e.preventDefault(); if(isGameRunning) shootArtifact(p1); });
    document.getElementById('btn-shoot-p2').addEventListener('touchstart', e => { e.preventDefault(); if(isGameRunning) shootArtifact(p2); });

    /* Controller (Gamepad API), alaturi de tastatura/touch: pad 0 -> P1, pad 1 -> P2.
       Stick stanga = miscare, LB/RB = rotire (ca Q/E), A sau RT = shoot. */
    const padPrevShoot = [false, false];
    let padVec1 = { x: 0, y: 0 }, padVec2 = { x: 0, y: 0 }, padRot1 = 0, padRot2 = 0;

    function pollGamepads() {
        if (!isGameRunning || !navigator.getGamepads) return;
        const pads = navigator.getGamepads();
        [[0, p1], gameMode === '1v1' ? [1, p2] : null].filter(Boolean).forEach(([idx, player]) => {
            const gp = pads[idx];
            const vec = idx === 0 ? padVec1 : padVec2;
            if (!gp) { vec.x = 0; vec.y = 0; if (idx === 0) padRot1 = 0; else padRot2 = 0; return; }
            const dz = v => Math.abs(v) < 0.18 ? 0 : v;
            // Doar fata-spate de pe stick (axa Y); stanga-dreapta pe stick e ignorata, robotul se ghideaza cu LB/RB
            let y = dz(gp.axes[1] || 0);
            vec.x = 0; vec.y = Math.max(-1, Math.min(1, y));
            const rotStick = (() => {
                // Nu toate controllerele raporteaza stick-ul drept pe axele 2/3 (depinde de model/OS/browser);
                // luam axa cu cea mai mare deviatie dintre cele ramase, ca sa functioneze indiferent de mapare.
                let best = 0, bestAbs = 0;
                for (let i = 2; i < gp.axes.length; i++) {
                    const v = dz(gp.axes[i] || 0);
                    if (Math.abs(v) > bestAbs) { bestAbs = Math.abs(v); best = v; }
                }
                return best;
            })();
            const rot = Math.max(-1, Math.min(1, ((gp.buttons[5] && gp.buttons[5].pressed ? 1 : 0) - (gp.buttons[4] && gp.buttons[4].pressed ? 1 : 0)) + rotStick));
            if (idx === 0) padRot1 = rot; else padRot2 = rot;
            const shootDown = !!((gp.buttons[6] && gp.buttons[6].pressed) || (gp.buttons[7] && gp.buttons[7].pressed));
            if (shootDown && !padPrevShoot[idx]) shootArtifact(player);
            padPrevShoot[idx] = shootDown;
        });
    }
    window.addEventListener('gamepadconnected', e => {
        const gp = e.gamepad;
        console.log('Controller conectat:', gp.id, '| mapping:', gp.mapping || '(nestandard)', '| axe:', gp.axes.length, '| butoane:', gp.buttons.length);
    });


    /* ----------------------------------------------------
       5. GAME MECHANICS
       ---------------------------------------------------- */
    // Punctul unde aterizează artefactul; dacă cade lângă un coș, e atras spre centrul lui
    function aimPoint(player) {
        const sx = player.x + Math.cos(player.angle) * player.radius;
        const sy = player.y + Math.sin(player.angle) * player.radius;
        let x = sx + Math.cos(player.angle) * 280, y = sy + Math.sin(player.angle) * 280, lock = null;
        for (const b of [highBasket, lowBasket]) {
            if (Math.hypot(x - b.x, y - b.y) < b.radius + 35) {
                x = b.x + (x - b.x) * 0.25; y = b.y + (y - b.y) * 0.25; lock = b; break;
            }
        }
        return { x, y, lock };
    }

    function shootArtifact(player) {
        if (player.inventory <= 0) {
            showNotification(`${player.label}: FĂRĂ ARTEFACTE!`);
            return;
        }

        player.inventory--;
        updateHUD();
        playSound('shoot');

        const startX = player.x + Math.cos(player.angle) * player.radius;
        const startY = player.y + Math.sin(player.angle) * player.radius;
        const aim = aimPoint(player);

        projectiles.push({
            owner: player,
            x: startX,
            y: startY,
            startX: startX,
            startY: startY,
            targetX: aim.x,
            targetY: aim.y,
            progress: 0,
            speed: 0.04
        });

        checkAutoRespawn();
    }

    function checkPickups(player) {
        if (player.inventory >= player.maxInventory) return;

        artifacts.forEach(item => {
            if (item.active) {
                const dist = Math.hypot(player.x - item.x, player.y - item.y);
                if (dist < player.radius + item.radius) {
                    item.active = false;
                    player.inventory++;
                    updateHUD();
                    playSound('pickup');
                }
            }
        });

        checkAutoRespawn();
    }

    function checkAutoRespawn() {
        const activeOnFloor = artifacts.filter(a => a.active).length;
        const totalInv = p1.inventory + (gameMode === '1v1' ? p2.inventory : 0);
        if (activeOnFloor === 0 && totalInv === 0 && projectiles.length === 0) {
            spawnArtifacts();
            showNotification("NOI ARTEFACTE GENERATE!");
        }
    }

    function updateProjectiles() {
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            p.progress += p.speed * frameDt;

            p.x = p.startX + (p.targetX - p.startX) * p.progress;
            p.y = p.startY + (p.targetY - p.startY) * p.progress;

            if (p.progress >= 1) {
                let scored = false;
                if (Math.hypot(p.x - highBasket.x, p.y - highBasket.y) < highBasket.radius) {
                    p.owner.score += highBasket.pts;
                    showNotification(`${p.owner.id} HIGH BASKET! +100 PTS`);
                    playSound('score');
                    scored = true;
                } else if (Math.hypot(p.x - lowBasket.x, p.y - lowBasket.y) < lowBasket.radius) {
                    p.owner.score += lowBasket.pts;
                    showNotification(`${p.owner.id} LOW BASKET! +50 PTS`);
                    playSound('score');
                    scored = true;
                }

                if (scored) updateHUD();
                projectiles.splice(i, 1);
                checkAutoRespawn();
            }
        }
    }

    function showNotification(msg) {
        const banner = document.getElementById('notification-banner');
        document.getElementById('notification-text').innerText = msg;
        banner.style.opacity = '1';
        setTimeout(() => { banner.style.opacity = '0'; }, 1600);
    }

    function updateHUD() {
        document.getElementById('hud-score-p1').innerText = `${p1.score} PTS`;
        document.getElementById('hud-inv-p1').innerText = `Inv: ${p1.inventory}/${p1.maxInventory}`;

        document.getElementById('hud-score-p2').innerText = `${p2.score} PTS`;
        document.getElementById('hud-inv-p2').innerText = `Inv: ${p2.inventory}/${p2.maxInventory}`;

        const mins = Math.floor(timeRemaining / 60);
        const secs = timeRemaining % 60;
        document.getElementById('hud-timer').innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /* ----------------------------------------------------
       6. CANVAS RENDER LOOP & DETAILED GRAPHICS
       ---------------------------------------------------- */
let arenaBg = null;
    function buildArenaBg() {
        const c = document.createElement('canvas'); c.width = c.height = ARENA_SIZE;
        const g = c.getContext('2d');
        let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const O = '255,107,0', B = '0,210,255';
        g.fillStyle = '#060b1c'; g.fillRect(0, 0, 800, 800);
        g.fillStyle = 'rgba(0,210,255,0.08)';
        for (let y = 10; y < 800; y += 20) for (let x = ((y / 20) % 2) * 10 + 10; x < 800; x += 20) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }

        // Pete de spray cu stropi și dâre
        [[110, 150, 150, O], [320, 90, 110, B], [80, 600, 140, B], [670, 690, 170, O], [740, 390, 130, B], [430, 720, 110, B], [520, 330, 90, O]].forEach(([x, y, r, rgb]) => {
            const gr = g.createRadialGradient(x, y, 0, x, y, r);
            gr.addColorStop(0, `rgba(${rgb},0.34)`); gr.addColorStop(0.7, `rgba(${rgb},0.15)`); gr.addColorStop(1, `rgba(${rgb},0)`);
            g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
            for (let i = 0; i < 14; i++) { const a = rnd() * 6.283, d = r * (0.5 + rnd() * 0.9); g.fillStyle = `rgba(${rgb},${0.25 + rnd() * 0.3})`; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.5 + rnd() * 4, 0, 7); g.fill(); }
            g.lineCap = 'round';
            for (let i = 0; i < 3; i++) { const dx = x + (rnd() - 0.5) * r * 0.9, len = 30 + rnd() * 70; g.strokeStyle = `rgba(${rgb},0.4)`; g.lineWidth = 3 + rnd() * 3; g.beginPath(); g.moveTo(dx, y + r * 0.3); g.lineTo(dx, y + r * 0.3 + len); g.stroke(); }
        });

        // Fulgere
        const pts = [[8, -50], [-20, 4], [-4, 4], [-12, 50], [20, -8], [4, -8], [18, -50]];
        [[120, 320, 1.6, -0.3, O], [690, 470, 1.4, 0.35, B], [330, 610, 1.1, 0.2, O], [410, 110, 1.2, -0.15, B]].forEach(([x, y, sc, rot, rgb]) => {
            g.save(); g.translate(x, y); g.rotate(rot); g.scale(sc, sc);
            g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath();
            g.fillStyle = `rgba(${rgb},0.26)`; g.fill(); g.lineWidth = 2.5 / sc; g.lineJoin = 'round'; g.strokeStyle = `rgba(${rgb},0.75)`; g.stroke();
            g.restore();
        });

        // Scribble-uri
        g.lineCap = 'round'; g.lineWidth = 6;
        [[50, 770, 220, B], [560, 40, 200, O], [30, 400, 150, O], [610, 470, 170, B]].forEach(([x, y, w, rgb]) => {
            g.strokeStyle = `rgba(${rgb},0.4)`; g.beginPath(); g.moveTo(x, y);
            for (let i = 1; i <= 6; i++) g.quadraticCurveTo(x + i * w / 6 - w / 12, y + (i % 2 ? -22 : 22), x + i * w / 6, y);
            g.stroke();
        });

        // Tag-uri pe perete
        g.textAlign = 'center'; g.lineWidth = 3;
        g.save(); g.translate(150, 480); g.rotate(-0.22); g.font = "68px 'Permanent Marker', Impact, cursive";
        g.strokeStyle = 'rgba(0,210,255,0.35)'; g.fillStyle = 'rgba(0,210,255,0.1)'; g.strokeText("WATT'S UP", 0, 0); g.fillText("WATT'S UP", 0, 0); g.restore();
        g.save(); g.translate(640, 590); g.rotate(0.14); g.font = "64px 'Permanent Marker', Impact, cursive";
        g.strokeStyle = 'rgba(255,107,0,0.4)'; g.fillStyle = 'rgba(255,107,0,0.12)'; g.strokeText('#16166', 0, 0); g.fillText('#16166', 0, 0); g.restore();

        // Bordură tip bandă de avertizare, portocaliu + albastru
        g.save(); g.beginPath(); g.rect(0, 0, 800, 800); g.rect(12, 12, 776, 776); g.clip('evenodd');
        for (let i = -800, k = 0; i < 800; i += 28, k++) {
            g.fillStyle = k % 2 ? '#ff6b00' : '#00d2ff';
            g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 28, 0); g.lineTo(i + 828, 800); g.lineTo(i + 800, 800); g.fill();
        }
        g.restore();
        g.strokeStyle = '#050914'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 797, 797); g.strokeRect(13.5, 13.5, 773, 773);
        return c;
    }
    if (document.fonts) document.fonts.load("68px 'Permanent Marker'").then(() => { arenaBg = null; });

    function resizeCanvas() {
        const container = document.getElementById('game-container');
        const size = Math.min(container.clientWidth, container.clientHeight);
        // Randam la rezolutia fizica reala a ecranului (devicePixelRatio), nu doar la marimea CSS,
        // altfel pe telefoane cu ecran de mare densitate (DPR 2-3) totul iese neclar/pixelat.
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
        scale = canvas.width / ARENA_SIZE;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
    }

    /* SISTEM FIZICĂ ROȚI MECANUM CU INERȚIE ȘI ROTIRE LINĂ */
    let frameDt = 1, lastTime = performance.now();

    function updatePlayerPhysics(player, controls, joyVec, padVec, padRot) {
        let ix = joyVec.x + padVec.x, iy = joyVec.y + padVec.y;
        if (keys[controls.up]) iy -= 1;
        if (keys[controls.down]) iy += 1;
        if (keys[controls.left]) ix -= 1;
        if (keys[controls.right]) ix += 1;

        const len = Math.hypot(ix, iy);
        if (len > 1) { ix /= len; iy /= len; }
        const hasInput = len > 0.12;

        // Mecanum: viteza tinta = input * maxSpeed, accelerare/frânare lină, independent de FPS
        const k = 1 - Math.pow(1 - (hasInput ? 0.2 : 0.14), frameDt);
        player.vx += (ix * player.maxSpeed - player.vx) * k;
        player.vy += (iy * player.maxSpeed - player.vy) * k;
        player.x += player.vx * frameDt;
        player.y += player.vy * frameDt;

        // Rotire separată (aim): tap = reglaj fin, ținut = rotire tot mai rapidă, cu accelerare lină
        const dir = Math.max(-1, Math.min(1, (keys[controls.rotR] ? 1 : 0) - (keys[controls.rotL] ? 1 : 0) + (player.rotBtn || 0) + padRot));
        player.rotHeat = dir ? Math.min(1, (player.rotHeat || 0) + 0.025 * frameDt) : 0;
        player.vRot += (dir * (0.016 + 0.05 * player.rotHeat) - player.vRot) * (1 - Math.pow(0.7, frameDt));
        player.angle += player.vRot * frameDt;

        // Rotire automată lentă spre direcția de mers; Q/E preiau aim-ul până te oprești o clipă
        if (dir) player.manual = true;
        if (hasInput) player.idleT = 0;
        else if ((player.idleT = (player.idleT || 0) + frameDt) > 45) player.manual = false;
        if (hasInput && !dir && !player.manual) {
            let diff = Math.atan2(iy, ix) - player.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            player.angle += Math.max(-0.08, Math.min(0.08, diff * 0.12)) * frameDt;
        }

        // Pereți: robotul alunecă, fără ricoșeu
        const m = player.radius + 8, M = ARENA_SIZE - m;
        if (player.x < m) { player.x = m; player.vx = Math.max(0, player.vx); }
        if (player.x > M) { player.x = M; player.vx = Math.min(0, player.vx); }
        if (player.y < m) { player.y = m; player.vy = Math.max(0, player.vy); }
        if (player.y > M) { player.y = M; player.vy = Math.min(0, player.vy); }

        checkPickups(player);
    }

    function separateRobots() {
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const d = Math.hypot(dx, dy), min = p1.radius + p2.radius - 6;
        if (d > 0 && d < min) {
            const nx = dx / d, ny = dy / d, push = (min - d) / 2;
            p1.x -= nx * push; p1.y -= ny * push;
            p2.x += nx * push; p2.y += ny * push;
        }
    }

    function updatePhysics() {
        if (!isGameRunning) return;
        pollGamepads();
        updatePlayerPhysics(p1, { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', rotL: 'KeyQ', rotR: 'KeyE' }, j1Vec, padVec1, padRot1);
        if (gameMode === '1v1') {
            updatePlayerPhysics(p2, { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', rotL: 'Comma', rotR: 'Period' }, j2Vec, padVec2, padRot2);
            separateRobots();
        }
        updateProjectiles();
    }

    function drawArenaDecals() {
        // Centru: FTC.PNG semitransparent integrat în arenă (MĂRIT)
        ctx.save();
        ctx.translate(400, 400);
        ctx.globalAlpha = 0.35;

        if (images.ftcLoaded) {
            const size = 420; // Mărit de la 260px la 420px
            ctx.drawImage(images.ftcCenter, -size / 2, -size / 2, size, size);
        } else {
            ctx.font = '900 42px Orbitron';
            ctx.fillStyle = '#00d2ff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText("FTC DECODE", 0, 0);
        }
        ctx.restore();
    }

    function drawAdvancedRobot(player) {
        const r = player.radius, col = player.color;
        const rgb = col === '#ff6b00' ? '255,107,0' : '0,210,255';
        const sp = Math.hypot(player.vx, player.vy);

        // Umbra pe sol (offset în lume, nu se rotește cu lumina)
        ctx.save();
        ctx.translate(player.x + 5, player.y + 7);
        ctx.rotate(player.angle);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.roundRect(-r, -r + 4, r * 2, (r - 4) * 2, 10); ctx.fill();
        ctx.restore();

        // Dâră de mișcare
        if (sp > 1.5) {
            const ex = player.x - player.vx * 7, ey = player.y - player.vy * 7;
            const g = ctx.createLinearGradient(player.x, player.y, ex, ey);
            g.addColorStop(0, `rgba(${rgb},0.35)`); g.addColorStop(1, `rgba(${rgb},0)`);
            ctx.strokeStyle = g; ctx.lineWidth = 22; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.lineCap = 'butt';
        }

        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(player.angle);

        // Linie de țintire + reticul unde aterizează artefactul
        const reach = r + 280;
        const aim = ctx.createLinearGradient(r, 0, reach, 0);
        aim.addColorStop(0, `rgba(${rgb},0.5)`); aim.addColorStop(1, `rgba(${rgb},0.08)`);
        ctx.strokeStyle = aim; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(reach, 0); ctx.stroke();
        ctx.setLineDash([]);
        const locked = !!aimPoint(player).lock;
        ctx.strokeStyle = locked ? '#ffffff' : `rgba(${rgb},0.55)`; ctx.lineWidth = locked ? 3 : 2;
        ctx.beginPath(); ctx.arc(reach, 0, locked ? 13 : 9, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = locked ? '#ffffff' : col; ctx.beginPath(); ctx.arc(reach, 0, locked ? 4 : 2.5, 0, Math.PI * 2); ctx.fill();

        // Roți Mecanum (rolele în model X)
        const wx = [-r + 5, r - 27], wt = -r - 3, wb = r - 9;
        [[wx[0], wt, 1], [wx[1], wt, -1], [wx[0], wb, -1], [wx[1], wb, 1]].forEach(([x, y, d]) => {
            ctx.fillStyle = '#0b1220'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.roundRect(x, y, 22, 12, 3); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = `rgba(${rgb},0.75)`;
            for (let i = 0; i < 4; i++) {
                const px = x + 4 + i * 5;
                ctx.beginPath(); ctx.moveTo(px - 2 * d, y + 2); ctx.lineTo(px + 2 * d, y + 10); ctx.stroke();
            }
        });

        // Șasiu
        const body = ctx.createLinearGradient(0, -r, 0, r);
        body.addColorStop(0, '#16213e'); body.addColorStop(1, '#0a1128');
        ctx.fillStyle = body; ctx.strokeStyle = '#475569'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.roundRect(-r, -r + 4, r * 2, (r - 4) * 2, 10); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = `rgba(${rgb},0.6)`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(-r + 8, -r + 12, r * 2 - 24, (r - 12) * 2, 5); ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.roundRect(r - 12, -r + 12, 7, (r - 12) * 2, 3); ctx.fill();

        // Țeavă + turelă
        ctx.fillStyle = '#0f172a'; ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(6, -7, 24, 14, 3); ctx.fill(); ctx.stroke();
        const dome = ctx.createRadialGradient(-4, -4, 2, 0, 0, 15);
        dome.addColorStop(0, '#ffffff'); dome.addColorStop(0.35, col); dome.addColorStop(1, '#0a1128');
        ctx.fillStyle = dome;
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();

        // LED-uri stoc (în spatele robotului)
        for (let i = 0; i < player.maxInventory; i++) {
            const on = i < player.inventory;
            ctx.fillStyle = on ? '#00ff66' : '#334155';
            ctx.shadowColor = '#00ff66'; ctx.shadowBlur = on ? 8 : 0;
            ctx.beginPath(); ctx.arc(-r + 14, (i - 1) * 9, 3.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();

        // Etichetă mereu dreaptă, deasupra sau sub robot
        ctx.save();
        ctx.font = '900 10px Orbitron'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const w = ctx.measureText(player.label).width + 14;
        const ly = player.y > ARENA_SIZE / 2 ? player.y - r - 24 : player.y + r + 8;
        ctx.fillStyle = 'rgba(4,8,20,0.8)'; ctx.strokeStyle = col; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(player.x - w / 2, ly, w, 16, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.fillText(player.label, player.x, ly + 8);
        ctx.restore();
    }

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(scale, scale);

        // Perete grafitti pre-randat
        if (!arenaBg) arenaBg = buildArenaBg();
        ctx.drawImage(arenaBg, 0, 0);

        // Grafică ftc.png în centrul arenei
        drawArenaDecals();

        // Inele de ghidaj pe centru (portocaliu / albastru, în contrasens)
        const tt = performance.now() / 1000;
        ctx.save(); ctx.translate(400, 400);
        [[140, '255,107,0', 1], [156, '0,210,255', -1]].forEach(([rad, rgb, d]) => {
            ctx.save(); ctx.rotate(tt * 0.35 * d);
            ctx.strokeStyle = `rgba(${rgb},0.5)`; ctx.lineWidth = 3; ctx.setLineDash([22, 14]);
            ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        });
        ctx.restore();

        // Coșuri de scor
        const t = performance.now() / 1000;
        [[lowBasket, '0,210,255', '#00d2ff', 'LOW (50)', 3, 1], [highBasket, '255,107,0', '#ff6b00', 'HIGH (100)', 4, -1]].forEach(([b, rgb, col, txt, lw, dir]) => {
            ctx.save();
            const g = ctx.createRadialGradient(b.x, b.y, 4, b.x, b.y, b.radius);
            g.addColorStop(0, `rgba(${rgb},0.04)`); g.addColorStop(1, `rgba(${rgb},0.3)`);
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
            ctx.translate(b.x, b.y); ctx.rotate(t * 0.6 * dir);
            ctx.strokeStyle = `rgba(${rgb},0.55)`; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
            ctx.beginPath(); ctx.arc(0, 0, b.radius + 8, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
            ctx.font = '900 12px Orbitron'; ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(txt, b.x, b.y);
        });

        // Artefacte pe teren
        artifacts.forEach(item => {
            if (!item.active) return;
            const rr = item.radius * (1 + 0.07 * Math.sin(t * 4 + item.id * 1.3));
            ctx.save();
            ctx.shadowColor = item.color; ctx.shadowBlur = 14;
            const g = ctx.createRadialGradient(item.x - 4, item.y - 4, 1, item.x, item.y, rr);
            g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, item.color); g.addColorStop(1, 'rgba(0,0,0,0.55)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(item.x, item.y, rr, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        });

        // Roboti detaliați
        drawAdvancedRobot(p1);
        if (gameMode === '1v1') drawAdvancedRobot(p2);

        // Artefacte în zbor
        projectiles.forEach(p => {
            const lift = pr => Math.sin(pr * Math.PI) * 70;
            const h = lift(p.progress);
            ctx.save();
            for (let j = 4; j >= 1; j--) {
                const pr = p.progress - j * 0.035;
                if (pr < 0) continue;
                ctx.globalAlpha = 0.35 * (5 - j) / 4;
                ctx.fillStyle = p.owner.color;
                ctx.beginPath();
                ctx.arc(p.startX + (p.targetX - p.startX) * pr, p.startY + (p.targetY - p.startY) * pr - lift(pr), 9 - j, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = `rgba(0,0,0,${0.4 - h / 250})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, 8 - h / 20, 0, Math.PI * 2); ctx.fill();
            ctx.shadowColor = p.owner.color; ctx.shadowBlur = 14;
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.arc(p.x, p.y - h, 9 + h / 18, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
            ctx.restore();
        });

        ctx.restore();
    }

    /* ----------------------------------------------------
       7. TIMING & GAME FLOW CONTROLS
       ---------------------------------------------------- */
    function startTimer() {
        clearInterval(timerInterval);
        timeRemaining = MATCH_DURATION;
        updateHUD();

        timerInterval = setInterval(() => {
            if (timeRemaining > 0) {
                timeRemaining--;
                updateHUD();
            } else {
                endGame();
            }
        }, 1000);
    }

    function endGame() {
        isGameRunning = false;
        clearInterval(timerInterval);
        playSound('gameover');

        const winnerText = document.getElementById('winner-text');
        const scoreP1Elem = document.getElementById('final-score-p1');
        const scoreP2Elem = document.getElementById('final-score-p2');
        const finalP2Box = document.getElementById('final-p2-box');

        scoreP1Elem.innerText = `${p1.score} PTS`;
        scoreP2Elem.innerText = `${p2.score} PTS`;

        if (gameMode === '1v1') {
            finalP2Box.style.display = 'block';
            if (p1.score > p2.score) {
                winnerText.innerText = "🏆 JUCĂTORUL 1 (ORANGE) A CÂȘTIGAT!";
                winnerText.className = "text-lg sm:text-2xl font-orbitron font-bold text-wuOrange glow-orange mt-2";
            } else if (p2.score > p1.score) {
                winnerText.innerText = "🏆 JUCĂTORUL 2 (BLUE) A CÂȘTIGAT!";
                winnerText.className = "text-lg sm:text-2xl font-orbitron font-bold text-wuBlue glow-blue mt-2";
            } else {
                winnerText.innerText = "🤝 EGALITATE PERFECTĂ!";
                winnerText.className = "text-lg sm:text-2xl font-orbitron font-bold text-wuYellow mt-2";
            }
        } else {
            finalP2Box.style.display = 'none';
            winnerText.innerText = `PRACTICE COMPLET! SCOR: ${p1.score} PTS`;
            winnerText.className = "text-lg sm:text-2xl font-orbitron font-bold text-wuOrange glow-orange mt-2";
        }

        document.getElementById('game-over-screen').style.display = 'flex';
    }

    function requestFullscreenSafe() {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if (req) { try { Promise.resolve(req.call(el)).catch(() => {}); } catch (e) {} }
    }

    function startGame(mode) {
        requestFullscreenSafe();
        gameMode = mode;
        p1.score = 0; p1.inventory = 0; p1.x = 320; p1.y = 650; p1.vx = 0; p1.vy = 0; p1.vRot = 0; p1.angle = -Math.PI / 2;
        p2.score = 0; p2.inventory = 0; p2.x = 480; p2.y = 650; p2.vx = 0; p2.vy = 0; p2.vRot = 0; p2.angle = -Math.PI / 2;
        projectiles = [];

        document.getElementById('splash-screen').style.display = 'none';
        document.getElementById('game-over-screen').style.display = 'none';
        document.getElementById('p2-score-box').style.display = mode === '1v1' ? 'flex' : 'none';
        document.getElementById('p2-mobile-controls').style.display = mode === '1v1' ? 'block' : 'none';

        isGameRunning = true;
        spawnArtifacts();
        startTimer();
    }

    function restartGame() {
        startGame(gameMode);
    }

    function exitToMenu() {
        isGameRunning = false;
        clearInterval(timerInterval);
        document.getElementById('game-over-screen').style.display = 'none';
        document.getElementById('splash-screen').style.display = 'flex';
    }

    function gameLoop(now = performance.now()) {
        frameDt = Math.min((now - lastTime) / 16.667, 3) || 1;
        lastTime = now;
        updatePhysics();
        render();
        requestAnimationFrame(gameLoop);
    }

    window.addEventListener('resize', resizeCanvas);
    window.onload = () => {
        resizeCanvas();
        gameLoop();
    };

