// Initialize Reveal.js with comfortable margins and scale bounds
Reveal.initialize({
  hash: true,
  transition: 'fade', // Smooth premium fade transition
  controls: true,
  progress: true,
  center: true, // Centers vertical alignments
  margin: 0.02, // Minimal whitespace margin around boundaries
  width: 1340,  // Scale up viewport width to fit elements and infographics
  height: 940,  // Scale up viewport height to fit detailed cards, flows, and tables
  minScale: 0.2,
  maxScale: 2.0
});

// Configure Mermaid with light theme variables to prevent text clipping
mermaid.initialize({
  startOnLoad: false, // Turn off automatic rendering to fix size calculations in hidden slides
  theme: 'default',
  securityLevel: 'loose',
  themeVariables: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    textColor: '#0f172a',
    mainBkg: '#ffffff',
    nodeBorder: '#d97706',
    lineColor: '#94a3b8',
    actorBorder: '#d97706',
    actorBkg: '#ffffff',
    actorTextColor: '#0f172a',
    signalColor: '#475569',
    signalTextColor: '#0f172a',
    labelTextColor: '#0f172a',
    loopBkg: '#f8fafc',
    noteBkg: '#fef3c7',
    noteBorder: '#fde68a',
    noteTextColor: '#92400e'
  },
  flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
  sequence: { useMaxWidth: true, height: 45, actorMargin: 50 },
  er: { useMaxWidth: true }
});

// Render Mermaid diagrams dynamically when slide is displayed
function renderMermaidInActiveSlide(slide) {
  if (!slide) return;
  
  const diagrams = slide.querySelectorAll('.mermaid:not([data-processed="true"])');
  diagrams.forEach((element) => {
    // Generate a unique ID for the SVG
    const uniqueId = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
    const code = element.textContent.trim();
    
    // Clear element content before render to avoid flash of raw text
    element.innerHTML = '<div class="flex-center" style="font-size:0.8em;color:#64748b;padding:20px;">Rendering diagram...</div>';
    
    try {
      mermaid.render(uniqueId, code, (svgCode) => {
        element.innerHTML = svgCode;
        element.setAttribute('data-processed', 'true');
        
        // Find inside SVG and adjust sizing properties
        const svg = element.querySelector('svg');
        if (svg) {
          svg.removeAttribute('height');
          svg.style.removeProperty('max-width');
          svg.style.width = '100%';
          svg.style.height = 'auto';
          svg.style.display = 'block';
        }
      });
    } catch (err) {
      console.error('Mermaid render error:', err);
      element.innerHTML = `<div class="info-card accent" style="border-left-color:#ef4444;color:#ef4444;font-size:0.75em;">Diagram render error. Please verify syntax.</div>`;
    }
  });

  // Also dispatch a window resize event to let graphics or other flex-based items layout properly
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
  }, 50);
}

// Update Slide Numbers in the Global Footer dynamically
function updateGlobalSlideNumber(event) {
  const currentSlide = event.indexh + 1;
  let pageText = currentSlide;
  
  // Handle vertical slide index notation (e.g. 8.1, 8.2)
  if (event.indexv > 0) {
    pageText += `.${event.indexv}`;
  }
  
  const totalSlides = Reveal.getTotalSlides();
  const display = document.getElementById('slide-number-display');
  if (display) {
    display.textContent = `${pageText} / ${totalSlides}`;
  }
}

// BIND REVEAL.JS TRANSITION LIFE CYCLES
Reveal.on('ready', event => {
  renderMermaidInActiveSlide(event.currentSlide);
  updateGlobalSlideNumber(event);
});

Reveal.on('slidechanged', event => {
  renderMermaidInActiveSlide(event.currentSlide);
  updateGlobalSlideNumber(event);
});
