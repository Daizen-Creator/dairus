// Galeria de fundos embutida no app (desenhos SVG: leves, nítidos em qualquer
// resolução e sem depender de internet).

export interface ImagemGaleria {
  id: string;
  nome: string;
  categoria: "Natureza" | "Abstrato" | "Minimalista" | "Cidade e espaço";
  svg: string;
}

const W = 1600;
const H = 900;
const svg = (conteudo: string, defs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${conteudo}</svg>`;

/** Gerador determinístico (a mesma imagem sempre igual). */
function aleatorio(semente: number) {
  let s = semente;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function estrelas(semente: number, n: number, alturaMax = H) {
  const r = aleatorio(semente);
  return Array.from({ length: n }, () => `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * alturaMax).toFixed(0)}" r="${(r() * 1.6 + 0.3).toFixed(2)}" fill="#fff" opacity="${(r() * 0.7 + 0.2).toFixed(2)}"/>`).join("");
}

/** Silhueta de cordilheira: picos aleatórios suaves. */
function cordilheira(semente: number, base: number, amplitude: number, cor: string, opacidade = 1) {
  const r = aleatorio(semente);
  const pontos: string[] = [`M0 ${H}`, `L0 ${base}`];
  let x = 0;
  while (x < W) {
    const passo = 80 + r() * 140;
    const pico = base - amplitude * (0.35 + r() * 0.65);
    pontos.push(`L${(x + passo / 2).toFixed(0)} ${pico.toFixed(0)}`, `L${(x + passo).toFixed(0)} ${(base - amplitude * r() * 0.3).toFixed(0)}`);
    x += passo;
  }
  pontos.push(`L${W} ${H}`, "Z");
  return `<path d="${pontos.join(" ")}" fill="${cor}" opacity="${opacidade}"/>`;
}

function ondas(cores: string[], base: number, altura: number) {
  return cores
    .map((c, i) => {
      const y = base + i * altura;
      const a = 40 + i * 12;
      return `<path d="M0 ${y} C ${W * 0.25} ${y - a}, ${W * 0.5} ${y + a}, ${W * 0.75} ${y - a / 2} S ${W} ${y + a / 3}, ${W} ${y} L${W} ${H} L0 ${H} Z" fill="${c}"/>`;
    })
    .join("");
}

function predios(semente: number, base: number, cor: string, janelas: string) {
  const r = aleatorio(semente);
  let x = 0;
  let saida = "";
  while (x < W) {
    const l = 50 + r() * 90;
    const a = 120 + r() * 380;
    saida += `<rect x="${x.toFixed(0)}" y="${(base - a).toFixed(0)}" width="${l.toFixed(0)}" height="${(a + H - base).toFixed(0)}" fill="${cor}"/>`;
    for (let jy = base - a + 14; jy < base - 10; jy += 22) {
      for (let jx = x + 8; jx < x + l - 10; jx += 16) {
        if (r() < 0.32) saida += `<rect x="${jx.toFixed(0)}" y="${jy.toFixed(0)}" width="7" height="10" fill="${janelas}" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`;
      }
    }
    x += l + 4;
  }
  return saida;
}

export const GALERIA: ImagemGaleria[] = [
  {
    id: "montanhas",
    nome: "Montanhas ao amanhecer",
    categoria: "Natureza",
    svg: svg(
      `<rect width="${W}" height="${H}" fill="url(#ceu)"/><circle cx="1180" cy="330" r="90" fill="#ffd8a8" opacity="0.9"/>${cordilheira(3, 560, 260, "#5b6b9a", 0.55)}${cordilheira(7, 650, 230, "#3b4a78", 0.8)}${cordilheira(11, 760, 180, "#1f2a4d")}${cordilheira(19, 860, 120, "#121a33")}`,
      `<linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e2a5a"/><stop offset="0.55" stop-color="#c06c84"/><stop offset="1" stop-color="#f8b195"/></linearGradient>`,
    ),
  },
  {
    id: "lago",
    nome: "Lago na noite",
    categoria: "Natureza",
    svg: svg(
      `<rect width="${W}" height="${H}" fill="url(#c)"/>${estrelas(5, 220, 520)}<circle cx="420" cy="220" r="60" fill="#f1f5f9"/>${cordilheira(23, 560, 200, "#0f2a3a")}<rect y="560" width="${W}" height="340" fill="url(#agua)"/><ellipse cx="420" cy="640" rx="40" ry="8" fill="#f1f5f9" opacity="0.35"/>`,
      `<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#020617"/><stop offset="1" stop-color="#1e3a5f"/></linearGradient><linearGradient id="agua" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16324a"/><stop offset="1" stop-color="#020617"/></linearGradient>`,
    ),
  },
  {
    id: "praia",
    nome: "Praia tropical",
    categoria: "Natureza",
    svg: svg(
      `<rect width="${W}" height="${H}" fill="url(#c)"/><circle cx="800" cy="470" r="120" fill="#fde68a"/>${ondas(["#0ea5b7", "#0891b2", "#0e7490"], 520, 40)}<path d="M0 760 C 400 700, 900 820, ${W} 740 L${W} ${H} L0 ${H} Z" fill="#f3d9a4"/>`,
      `<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#fbcfe8"/></linearGradient>`,
    ),
  },
  {
    id: "floresta",
    nome: "Floresta na névoa",
    categoria: "Natureza",
    svg: svg(
      `<rect width="${W}" height="${H}" fill="url(#c)"/>${[0, 1, 2, 3]
        .map((camada) => {
          const r = aleatorio(31 + camada);
          const cor = ["#9fb8a8", "#6f9483", "#3f6b58", "#1d3b30"][camada];
          let s = "";
          for (let x = -40; x < W + 40; x += 60 + r() * 50) {
            const base = 520 + camada * 110;
            const alt = 180 + r() * 160;
            s += `<path d="M${x.toFixed(0)} ${base} L${(x + 45).toFixed(0)} ${(base - alt).toFixed(0)} L${(x + 90).toFixed(0)} ${base} Z" fill="${cor}"/>`;
          }
          return s + `<rect y="${520 + camada * 110}" width="${W}" height="${H}" fill="${cor}"/>`;
        })
        .join("")}`,
      `<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6efe9"/><stop offset="1" stop-color="#b7cbbf"/></linearGradient>`,
    ),
  },
  {
    id: "dunas",
    nome: "Dunas",
    categoria: "Natureza",
    svg: svg(
      `<rect width="${W}" height="${H}" fill="url(#c)"/><circle cx="1250" cy="260" r="80" fill="#fff7ed" opacity="0.9"/>${ondas(["#f4b77f", "#e8955a", "#c96f3b", "#9a4d24"], 520, 85)}`,
      `<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde2c4"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>`,
    ),
  },
  {
    id: "ondas-azuis",
    nome: "Ondas azuis",
    categoria: "Abstrato",
    svg: svg(`<rect width="${W}" height="${H}" fill="#0b1437"/>${ondas(["#1e3a8a", "#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa"], 300, 110)}`),
  },
  {
    id: "bolhas",
    nome: "Bolhas de cor",
    categoria: "Abstrato",
    svg: svg(
      `<rect width="${W}" height="${H}" fill="#120a2a"/><circle cx="300" cy="250" r="320" fill="#7c3aed" filter="url(#b)" opacity="0.8"/><circle cx="1250" cy="200" r="280" fill="#06b6d4" filter="url(#b)" opacity="0.7"/><circle cx="900" cy="760" r="360" fill="#db2777" filter="url(#b)" opacity="0.6"/>`,
      `<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="90"/></filter>`,
    ),
  },
  {
    id: "malha",
    nome: "Malha neon",
    categoria: "Abstrato",
    svg: svg(
      `<rect width="${W}" height="${H}" fill="url(#c)"/>${Array.from({ length: 21 }, (_, i) => `<line x1="${800 + (i - 10) * 40}" y1="480" x2="${800 + (i - 10) * 220}" y2="${H}" stroke="#ff2bd6" stroke-width="2" opacity="0.6"/>`).join("")}${Array.from({ length: 9 }, (_, i) => { const y = 480 + i * i * 6 + i * 6; return `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#ff2bd6" stroke-width="2" opacity="0.6"/>`; }).join("")}<circle cx="800" cy="420" r="170" fill="url(#sol)"/>`,
      `<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0638"/><stop offset="0.55" stop-color="#3b0a5c"/><stop offset="0.56" stop-color="#0b0220"/><stop offset="1" stop-color="#000"/></linearGradient><linearGradient id="sol" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe259"/><stop offset="1" stop-color="#ff2bd6"/></linearGradient>`,
    ),
  },
  {
    id: "prisma",
    nome: "Prisma",
    categoria: "Abstrato",
    svg: svg(
      (() => {
        const r = aleatorio(41);
        const cores = ["#0f172a", "#1e293b", "#334155", "#1e3a8a", "#312e81", "#4c1d95"];
        let s = "";
        for (let y = 0; y < H; y += 150)
          for (let x = 0; x < W; x += 150) {
            s += `<path d="M${x} ${y} L${x + 150} ${y} L${x} ${y + 150} Z" fill="${cores[Math.floor(r() * cores.length)]}"/>`;
            s += `<path d="M${x + 150} ${y} L${x + 150} ${y + 150} L${x} ${y + 150} Z" fill="${cores[Math.floor(r() * cores.length)]}"/>`;
          }
        return s;
      })(),
    ),
  },
  {
    id: "linhas",
    nome: "Linhas finas",
    categoria: "Minimalista",
    svg: svg(`<rect width="${W}" height="${H}" fill="#f5f5f4"/>${Array.from({ length: 30 }, (_, i) => `<path d="M0 ${200 + i * 18} C 500 ${120 + i * 18}, 1100 ${320 + i * 18}, ${W} ${220 + i * 18}" stroke="#a8a29e" fill="none" stroke-width="1.2" opacity="${(0.15 + (i % 5) * 0.08).toFixed(2)}"/>`).join("")}`),
  },
  {
    id: "pontos",
    nome: "Pontilhado",
    categoria: "Minimalista",
    svg: svg(`<rect width="${W}" height="${H}" fill="#0f172a"/><rect width="${W}" height="${H}" fill="url(#p)"/>`, `<pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="16" cy="16" r="1.6" fill="#475569"/></pattern>`),
  },
  {
    id: "papel",
    nome: "Papel quente",
    categoria: "Minimalista",
    svg: svg(`<rect width="${W}" height="${H}" fill="url(#c)"/><circle cx="1400" cy="-100" r="500" fill="#fde68a" opacity="0.25"/><circle cx="100" cy="1000" r="450" fill="#fecaca" opacity="0.25"/>`, `<linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf7f0"/><stop offset="1" stop-color="#f1e9dc"/></linearGradient>`),
  },
  {
    id: "cidade-neon",
    nome: "Cidade neon",
    categoria: "Cidade e espaço",
    svg: svg(
      `<rect width="${W}" height="${H}" fill="url(#c)"/>${estrelas(9, 120, 400)}${predios(51, 820, "#140b2e", "#f0abfc")}${predios(57, 900, "#0a0618", "#67e8f9")}`,
      `<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0420"/><stop offset="0.7" stop-color="#5b1a7a"/><stop offset="1" stop-color="#ff2bd6"/></linearGradient>`,
    ),
  },
  {
    id: "galaxia",
    nome: "Galáxia",
    categoria: "Cidade e espaço",
    svg: svg(
      `<rect width="${W}" height="${H}" fill="#030014"/><ellipse cx="800" cy="450" rx="700" ry="160" fill="#7c3aed" opacity="0.35" filter="url(#b)" transform="rotate(-18 800 450)"/><ellipse cx="800" cy="450" rx="420" ry="80" fill="#22d3ee" opacity="0.3" filter="url(#b)" transform="rotate(-18 800 450)"/>${estrelas(77, 420)}`,
      `<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="60"/></filter>`,
    ),
  },
  {
    id: "planeta",
    nome: "Planeta",
    categoria: "Cidade e espaço",
    svg: svg(
      `<rect width="${W}" height="${H}" fill="#050816"/>${estrelas(13, 300)}<circle cx="1150" cy="980" r="560" fill="url(#p)"/><ellipse cx="1150" cy="560" rx="760" ry="70" fill="none" stroke="#f59e0b" stroke-width="10" opacity="0.5"/>`,
      `<radialGradient id="p" cx="0.35" cy="0.25"><stop offset="0" stop-color="#60a5fa"/><stop offset="0.6" stop-color="#1e3a8a"/><stop offset="1" stop-color="#0b1020"/></radialGradient>`,
    ),
  },
];

export const CATEGORIAS_GALERIA = [...new Set(GALERIA.map((g) => g.categoria))];

export function urlDaGaleria(id: string): string | null {
  const item = GALERIA.find((g) => g.id === id);
  return item ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.svg)}` : null;
}
