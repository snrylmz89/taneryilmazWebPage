const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const animatedNodes = document.querySelectorAll(".wl-animate");
const slider = document.querySelector("[data-slider]");

const syncHeader = () => {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 16);
};

const syncMenu = () => {
  if (!menuToggle || !nav) return;

  const expanded = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!expanded));
  nav.classList.toggle("is-open", !expanded);
};

if (menuToggle) {
  menuToggle.addEventListener("click", syncMenu);
}

if (nav) {
  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      menuToggle?.setAttribute("aria-expanded", "false");
      nav.classList.remove("is-open");
    });
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  },
  {
    threshold: 0.16,
    rootMargin: "0px 0px -8% 0px",
  },
);

animatedNodes.forEach((node) => observer.observe(node));

const setupSlider = () => {
  if (!slider) return;

  const viewport = slider.querySelector("[data-slider-viewport]");
  const prevButton = slider.querySelector("[data-slider-prev]");
  const nextButton = slider.querySelector("[data-slider-next]");
  const dotsRoot = document.querySelector("[data-slider-dots]");
  const slides = Array.from(slider.querySelectorAll(".wl-service-slide"));

  if (!viewport || !dotsRoot || slides.length === 0) return;

  let currentIndex = 0;

  const slidesPerView = () => {
    if (window.innerWidth <= 860) return 1;
    if (window.innerWidth <= 1080) return 2;
    return 3;
  };

  const pageCount = () => Math.max(1, slides.length - slidesPerView() + 1);

  const buildDots = () => {
    dotsRoot.innerHTML = "";

    Array.from({ length: pageCount() }).forEach((_, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `Go to slide ${index + 1}`);
      dot.addEventListener("click", () => goTo(index));
      dotsRoot.appendChild(dot);
    });
  };

  const updateDots = () => {
    Array.from(dotsRoot.children).forEach((dot, index) => {
      dot.classList.toggle("is-active", index === currentIndex);
    });
  };

  const goTo = (index) => {
    currentIndex = Math.max(0, Math.min(index, pageCount() - 1));
    const gap = 15;
    const slideWidth = viewport.clientWidth / slidesPerView();
    const offset = currentIndex * (slideWidth + gap);

    viewport.scrollTo({
      left: offset,
      behavior: "smooth",
    });

    updateDots();
  };

  prevButton?.addEventListener("click", () => goTo(currentIndex - 1));
  nextButton?.addEventListener("click", () => goTo(currentIndex + 1));

  window.addEventListener("resize", () => {
    currentIndex = Math.min(currentIndex, pageCount() - 1);
    buildDots();
    goTo(currentIndex);
  });

  buildDots();
  goTo(0);
};

syncHeader();
setupSlider();

window.addEventListener("scroll", syncHeader, { passive: true });
