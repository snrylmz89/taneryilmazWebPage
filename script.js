const body = document.body;
const progressValue = Number.parseInt(body.dataset.progress || "72", 10);
const launchOffsetDays = Number.parseInt(body.dataset.launchOffsetDays || "30", 10);
const configuredLaunchDate = body.dataset.launchDate;

setupCanvas();
setupCountdown();
setupProgress();
setupNotifyForm();

function setupCanvas() {
  const canvas = document.getElementById("cs-canvas");

  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  let width = 0;
  let height = 0;
  const mouse = { x: 0, y: 0 };
  const nodes = [];
  let canvasConfig = getCanvasConfig(0);
  let frame = 0;
  let lastFire = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvasConfig = getCanvasConfig(width);
    buildNodes();
  }

  function getCanvasConfig(viewportWidth) {
    const isMobile = viewportWidth <= 720;

    return {
      nodeCount: isMobile ? 34 : 55,
      connectionDistance: isMobile ? 116 : 160,
      centerYRatio: isMobile ? 0.6 : 0.48,
      scaleRatio: isMobile ? 0.28 : 0.38,
      ellipseRatio: isMobile ? 0.6 : 0.72,
      glowRadiusRatio: isMobile ? 0.3 : 0.4,
      glowStrength: isMobile ? 0.075 : 0.12,
      glowMidStrength: isMobile ? 0.032 : 0.05,
      driftStrength: isMobile ? 0.0045 : 0.006,
      jitterStrength: isMobile ? 0.024 : 0.04,
      fireInterval: isMobile ? 30 : 22,
      maxConnections: isMobile ? 3 : 4,
      connectionOpacity: isMobile ? 0.58 : 1,
      pulseOpacity: isMobile ? 0.68 : 0.9,
      nodeOpacity: isMobile ? 0.82 : 1
    };
  }

  function buildNodes() {
    nodes.length = 0;

    const centerX = width * 0.5;
    const centerY = height * canvasConfig.centerYRatio;
    const scale = Math.min(width, height) * canvasConfig.scaleRatio;

    for (let index = 0; index < canvasConfig.nodeCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * scale;
      const homeX = centerX + Math.cos(angle) * radius;
      const homeY = centerY + Math.sin(angle) * radius * canvasConfig.ellipseRatio;

      nodes.push({
        x: homeX,
        y: homeY,
        hx: homeX,
        hy: homeY,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 1.2 + Math.random() * 2.0,
        act: 0,
        phase: Math.random() * Math.PI * 2,
        pulses: [],
        refractory: 0,
        delay: index * 1.4,
        entry: 0
      });
    }
  }

  function bezierPoint(x0, y0, cpx, cpy, x1, y1, t) {
    const inverse = 1 - t;

    return {
      x: inverse * inverse * x0 + 2 * inverse * t * cpx + t * t * x1,
      y: inverse * inverse * y0 + 2 * inverse * t * cpy + t * t * y1
    };
  }

  function fireNode(source) {
    if (source.refractory > 0) {
      return;
    }

    source.act = 1;
    source.refractory = 75;

    const candidates = nodes
      .filter((node) => node !== source && node.refractory === 0 && node.entry > 0.3)
      .map((node) => {
        const dx = node.x - source.x;
        const dy = node.y - source.y;

        return { node, distance: Math.sqrt(dx * dx + dy * dy) };
      })
      .filter(({ distance }) => distance < canvasConfig.connectionDistance)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, canvasConfig.maxConnections);

    for (const { node } of candidates) {
      source.pulses.push({
        t: 0,
        to: node,
        speed: 0.003 + Math.random() * 0.003,
        isGold: Math.random() > 0.75,
        cpx: (source.x + node.x) / 2 + (Math.random() - 0.5) * 50,
        cpy: (source.y + node.y) / 2 + (Math.random() - 0.5) * 50
      });

      if (source.pulses.length >= canvasConfig.maxConnections) {
        break;
      }
    }
  }

  function draw() {
    window.requestAnimationFrame(draw);
    frame += 1;

    ctx.fillStyle = "#050d1a";
    ctx.fillRect(0, 0, width, height);

    const glow = Math.min(frame / 90, 1);
    const glowX = width * 0.5 + (mouse.x - width * 0.5) * 0.03;
    const glowY = height * 0.48 + (mouse.y - height * 0.5) * 0.03;
    const gradient = ctx.createRadialGradient(
      glowX,
      glowY,
      0,
      glowX,
      glowY,
      width * canvasConfig.glowRadiusRatio
    );

    gradient.addColorStop(0, `rgba(42,127,143,${canvasConfig.glowStrength * glow})`);
    gradient.addColorStop(0.5, `rgba(15,34,64,${canvasConfig.glowMidStrength * glow})`);
    gradient.addColorStop(1, "rgba(5,13,26,0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const mouseX = (mouse.x - width * 0.5) * 0.012;
    const mouseY = (mouse.y - height * 0.5) * 0.012;

    nodes.forEach((node) => {
      node.entry = Math.min(1, Math.max(0, (frame - node.delay) / 55));

      if (node.entry <= 0) {
        return;
      }

      node.vx += (node.hx + mouseX - node.x) * canvasConfig.driftStrength;
      node.vy += (node.hy + mouseY - node.y) * canvasConfig.driftStrength;
      node.vx *= 0.91;
      node.vy *= 0.91;
      node.vx += (Math.random() - 0.5) * canvasConfig.jitterStrength;
      node.vy += (Math.random() - 0.5) * canvasConfig.jitterStrength;
      node.x += node.vx;
      node.y += node.vy;
      node.phase += 0.018;
      node.act *= 0.975;
      node.refractory = Math.max(0, node.refractory - 1);
    });

    if (frame - lastFire >= canvasConfig.fireInterval) {
      const available = nodes.filter((node) => node.refractory === 0 && node.entry > 0.5);

      if (available.length > 0) {
        const randomIndex = Math.floor(Math.random() * available.length);
        fireNode(available[randomIndex]);
      }

      lastFire = frame;
    }

    const connectionVisibility = Math.min(frame / 80, 1);

    for (let sourceIndex = 0; sourceIndex < nodes.length - 1; sourceIndex += 1) {
      const source = nodes[sourceIndex];

      if (source.entry < 0.05) {
        continue;
      }

      for (let targetIndex = sourceIndex + 1; targetIndex < nodes.length; targetIndex += 1) {
        const target = nodes[targetIndex];

        if (target.entry < 0.05) {
          continue;
        }

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > canvasConfig.connectionDistance) {
          continue;
        }

        const proximity = 1 - distance / canvasConfig.connectionDistance;
        const activity = (source.act + target.act) * 0.5;
        const alpha =
          proximity *
          connectionVisibility *
          (0.09 + activity * 0.45) *
          Math.min(source.entry, target.entry) *
          canvasConfig.connectionOpacity;

        if (alpha < 0.004) {
          continue;
        }

        const controlX = (source.x + target.x) * 0.5 + (target.y - source.y) * 0.07;
        const controlY = (source.y + target.y) * 0.5 - (target.x - source.x) * 0.07;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.quadraticCurveTo(controlX, controlY, target.x, target.y);

        if (activity > 0.2) {
          ctx.strokeStyle = `rgba(77,217,236,${alpha})`;
          ctx.lineWidth = 0.5 + activity * 0.9;
          ctx.shadowBlur = 5;
          ctx.shadowColor = "rgba(77,217,236,.6)";
        } else {
          ctx.strokeStyle = `rgba(38,90,110,${alpha * 0.8})`;
          ctx.lineWidth = 0.3;
          ctx.shadowBlur = 0;
        }

        ctx.stroke();
      }
    }

    ctx.shadowBlur = 0;

    nodes.forEach((source) => {
      source.pulses = source.pulses.filter((pulse) => {
        pulse.t += pulse.speed;

        if (pulse.t >= 1) {
          pulse.to.act = Math.min(1, pulse.to.act + 0.8);

          if (Math.random() < 0.3 && pulse.to.pulses.length < 2) {
            const nextCandidates = nodes
              .filter((node) => node !== source && node !== pulse.to && node.refractory === 0)
              .map((node) => {
                const dx = node.x - pulse.to.x;
                const dy = node.y - pulse.to.y;

                return { node, distance: Math.sqrt(dx * dx + dy * dy) };
              })
                .filter(({ distance }) => distance < canvasConfig.connectionDistance)
                .sort((left, right) => left.distance - right.distance);

            if (nextCandidates.length > 0) {
              const nextNode = nextCandidates[0].node;

              pulse.to.pulses.push({
                t: 0,
                to: nextNode,
                speed: pulse.speed * (0.85 + Math.random() * 0.15),
                isGold: pulse.isGold,
                cpx: (pulse.to.x + nextNode.x) / 2 + (Math.random() - 0.5) * 50,
                cpy: (pulse.to.y + nextNode.y) / 2 + (Math.random() - 0.5) * 50
              });
            }
          }

          return false;
        }

        const point = bezierPoint(
          source.x,
          source.y,
          pulse.cpx,
          pulse.cpy,
          pulse.to.x,
          pulse.to.y,
          pulse.t
        );
        const visibility =
          connectionVisibility *
          Math.pow(Math.sin(pulse.t * Math.PI), 0.6) *
          canvasConfig.pulseOpacity;

        if (visibility < 0.01) {
          return true;
        }

        for (let ghostIndex = 1; ghostIndex <= 4; ghostIndex += 1) {
          const trailTime = Math.max(0, pulse.t - ghostIndex * 0.022);
          const ghostPoint = bezierPoint(
            source.x,
            source.y,
            pulse.cpx,
            pulse.cpy,
            pulse.to.x,
            pulse.to.y,
            trailTime
          );
          const ghostAlpha = visibility * (1 - ghostIndex / 5) * 0.4;

          ctx.beginPath();
          ctx.arc(ghostPoint.x, ghostPoint.y, 0.7, 0, Math.PI * 2);
          ctx.fillStyle = pulse.isGold
            ? `rgba(201,168,76,${ghostAlpha})`
            : `rgba(160,235,255,${ghostAlpha})`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(point.x, point.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = pulse.isGold
          ? `rgba(255,225,110,${visibility})`
          : `rgba(240,252,255,${visibility})`;
        ctx.shadowBlur = 16;
        ctx.shadowColor = pulse.isGold ? "rgba(201,168,76,.9)" : "rgba(77,217,236,.9)";
        ctx.fill();
        ctx.shadowBlur = 0;

        return true;
      });
    });

    nodes.forEach((node) => {
      if (node.entry < 0.01) {
        return;
      }

      const pulse = 0.5 + 0.5 * Math.sin(node.phase);
      const glowStrength = node.act * 0.7;
      const radius = node.r * (1 + pulse * 0.18 + glowStrength * 0.22);

      if (glowStrength > 0.1) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(77,217,236,${glowStrength * 0.08 * node.entry})`;
        ctx.fill();
      }

      const baseAlpha = (0.6 + pulse * 0.25 + glowStrength * 0.15) * canvasConfig.nodeOpacity;

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);

      if (glowStrength > 0.15) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = `rgba(77,217,236,${glowStrength * 0.8})`;
      }

      ctx.fillStyle = `rgba(255,255,255,${baseAlpha * node.entry})`;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });

  resize();
  draw();
}

function setupCountdown() {
  const countdownDays = document.getElementById("cd-g");
  const countdownHours = document.getElementById("cd-s");
  const countdownMinutes = document.getElementById("cd-d");
  const countdownSeconds = document.getElementById("cd-sn");

  if (!countdownDays || !countdownHours || !countdownMinutes || !countdownSeconds) {
    return;
  }

  const launchDate = getLaunchDate();

  function pad(value) {
    return String(Math.floor(value)).padStart(2, "0");
  }

  function tick() {
    const diff = Math.max(0, launchDate.getTime() - Date.now());
    const days = diff / 864e5;
    const hours = (diff % 864e5) / 36e5;
    const minutes = (diff % 36e5) / 6e4;
    const seconds = (diff % 6e4) / 1e3;

    countdownDays.textContent = pad(days);
    countdownHours.textContent = pad(hours);
    countdownMinutes.textContent = pad(minutes);
    countdownSeconds.textContent = pad(seconds);
  }

  tick();
  window.setInterval(tick, 1000);
}

function getLaunchDate() {
  if (configuredLaunchDate) {
    const parsed = Date.parse(configuredLaunchDate);

    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }

  return new Date(Date.now() + launchOffsetDays * 24 * 60 * 60 * 1000);
}

function setupProgress() {
  const progressLabel = document.getElementById("prog-pct");
  const progressFill = document.getElementById("prog-fill");

  if (!progressLabel || !progressFill) {
    return;
  }

  const safeProgress = Math.max(0, Math.min(100, Number.isNaN(progressValue) ? 72 : progressValue));

  progressLabel.textContent = `${safeProgress}%`;

  window.setTimeout(() => {
    progressFill.style.width = `${safeProgress}%`;
  }, 400);
}

function setupNotifyForm() {
  const notifyForm = document.getElementById("notify-form");
  const notifyEmail = document.getElementById("notify-email");
  const notifyNote = document.getElementById("notify-note");
  const notifySuccess = document.getElementById("notify-success");

  if (!notifyForm || !notifyEmail || !notifySuccess) {
    return;
  }

  notifyForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const email = notifyEmail.value.trim();
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    notifyEmail.classList.remove("is-invalid");

    if (!email || !isValidEmail) {
      notifyEmail.classList.add("is-invalid");

      window.setTimeout(() => {
        notifyEmail.classList.remove("is-invalid");
      }, 1800);

      return;
    }

    notifyForm.style.display = "none";

    if (notifyNote) {
      notifyNote.style.display = "none";
    }

    notifySuccess.style.display = "block";
  });
}
