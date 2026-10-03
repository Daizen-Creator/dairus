// Gera src/features/dashboard/marcasSvg.ts com os logos (SVG, licença CC0) do pacote
// simple-icons para as marcas comuns no Brasil, mais selos de letra para as que faltam.
// Uso: node scripts/gerar-marcas.mjs
import fs from "node:fs";
import * as si from "simple-icons";

// id do simple-icons → palavras que aparecem na descrição do lançamento.
const MARCAS = {
  ubereats: ["uber eats", "ubereats"], youtubemusic: ["youtube music"], googledrive: ["google drive"], googlepay: ["google pay"], googleplay: ["google play"],
  applemusic: ["apple music"], appletv: ["apple tv"], applepay: ["apple pay"], appstore: ["app store"], icloud: ["icloud"], googlegemini: ["gemini"],
  netflix: ["netflix"], spotify: ["spotify"], anthropic: ["anthropic"], claude: ["claude"], hbomax: ["hbo max", "hbomax"], hbo: ["hbo"], max: ["max streaming"],
  youtube: ["youtube"], deezer: ["deezer"], paramountplus: ["paramount"], crunchyroll: ["crunchyroll"], twitch: ["twitch"], discord: ["discord"],
  playstation: ["playstation", "psn", "ps plus"], steam: ["steam"], epicgames: ["epic games"], riotgames: ["riot games", "league of legends", "valorant"],
  notion: ["notion"], figma: ["figma"], dropbox: ["dropbox"], github: ["github"], githubcopilot: ["copilot"], duolingo: ["duolingo"],
  uber: ["uber"], ifood: ["ifood"], airbnb: ["airbnb"], shopee: ["shopee"], aliexpress: ["aliexpress"], nubank: ["nubank"], picpay: ["picpay"],
  mercadopago: ["mercado pago"], paypal: ["paypal"], visa: ["visa"], mastercard: ["mastercard"], americanexpress: ["american express", "amex"],
  samsungpay: ["samsung pay"], pix: ["pix"], vivo: ["vivo"], whatsapp: ["whatsapp"], instagram: ["instagram"], facebook: ["facebook", "meta ads"],
  telegram: ["telegram"], x: ["twitter"], tiktok: ["tiktok"], zoom: ["zoom"], wix: ["wix"], godaddy: ["godaddy"], hostinger: ["hostinger"],
  cloudflare: ["cloudflare"], digitalocean: ["digitalocean"], vercel: ["vercel"], netlify: ["netlify"], tinder: ["tinder"], waze: ["waze"],
  shell: ["shell"], mcdonalds: ["mcdonald", "mc donald"], burgerking: ["burger king"], starbucks: ["starbucks"], kfc: ["kfc"], carrefour: ["carrefour"],
  ikea: ["ikea"], nike: ["nike"], adidas: ["adidas"], puma: ["puma"], zara: ["zara"], apple: ["apple"], audible: ["audible"], xiaomi: ["xiaomi"],
  samsung: ["samsung"], motorola: ["motorola"], dell: ["dell"], lenovo: ["lenovo"], hp: ["hp"], intel: ["intel"], nvidia: ["nvidia"], amd: ["amd"],
  lg: ["lg"], sony: ["sony"], cocacola: ["coca-cola", "coca cola"],
};
// Sem logo livre: selo com a cor da marca e as letras.
const SELOS = [
  { id: "canva", titulo: "Canva", cor: "00C4CC", texto: "C", palavras: ["canva"] },
  { id: "adobe", titulo: "Adobe", cor: "FA0F00", texto: "A", palavras: ["adobe", "photoshop", "lightroom"] },
  { id: "microsoft", titulo: "Microsoft", cor: "737373", texto: "MS", palavras: ["microsoft", "office 365", "microsoft 365", "onedrive", "xbox game pass"] },
  { id: "xbox", titulo: "Xbox", cor: "107C10", texto: "X", palavras: ["xbox"] },
  { id: "linkedin", titulo: "LinkedIn", cor: "0A66C2", texto: "in", palavras: ["linkedin"] },
  { id: "globoplay", titulo: "Globoplay", cor: "FB0234", texto: "g", palavras: ["globoplay", "globo"] },
  { id: "rappi", titulo: "Rappi", cor: "FF441F", texto: "R", palavras: ["rappi"] },
  { id: "booking", titulo: "Booking", cor: "003580", texto: "B.", palavras: ["booking"] },
  { id: "shein", titulo: "Shein", cor: "111111", texto: "S", palavras: ["shein"] },
  { id: "magalu", titulo: "Magalu", cor: "0086FF", texto: "M", palavras: ["magalu", "magazine luiza"] },
  { id: "tim", titulo: "TIM", cor: "004691", texto: "TIM", palavras: ["tim"] },
  { id: "oi", titulo: "Oi", cor: "FFD200", texto: "oi", palavras: ["oi fibra", "oi celular"] },
  { id: "c6", titulo: "C6 Bank", cor: "242424", texto: "C6", palavras: ["c6 bank", "c6bank"] },
  { id: "elo", titulo: "Elo", cor: "000000", texto: "elo", palavras: ["cartao elo"] },
  { id: "slack", titulo: "Slack", cor: "4A154B", texto: "#", palavras: ["slack"] },
  { id: "kindle", titulo: "Kindle", cor: "FF9900", texto: "K", palavras: ["kindle"] },
  { id: "dominos", titulo: "Domino's", cor: "006491", texto: "D", palavras: ["domino"] },
  { id: "subway", titulo: "Subway", cor: "008C15", texto: "S", palavras: ["subway"] },
  { id: "petrobras", titulo: "Petrobras", cor: "008542", texto: "BR", palavras: ["posto br", "petrobras"] },
  { id: "ipiranga", titulo: "Ipiranga", cor: "FFCD00", texto: "I", palavras: ["ipiranga"] },
  { id: "drogasil", titulo: "Drogasil", cor: "E3001B", texto: "D", palavras: ["drogasil", "droga raia", "drogaraia"] },
  { id: "paodeacucar", titulo: "Pão de Açúcar", cor: "00A651", texto: "PA", palavras: ["pao de acucar"] },
  { id: "assai", titulo: "Assaí", cor: "F26722", texto: "A", palavras: ["assai"] },
  { id: "atacadao", titulo: "Atacadão", cor: "EE3124", texto: "A", palavras: ["atacadao"] },
  { id: "renner", titulo: "Renner", cor: "D6001C", texto: "R", palavras: ["renner"] },
  { id: "riachuelo", titulo: "Riachuelo", cor: "000000", texto: "R", palavras: ["riachuelo"] },
  { id: "kabum", titulo: "Kabum", cor: "FF6500", texto: "K", palavras: ["kabum"] },
  { id: "americanas", titulo: "Americanas", cor: "E60014", texto: "a", palavras: ["americanas"] },
  { id: "casasbahia", titulo: "Casas Bahia", cor: "0033A0", texto: "CB", palavras: ["casas bahia"] },
  { id: "sabesp", titulo: "Conta de água", cor: "0077C8", texto: "💧", palavras: ["sabesp", "copasa", "cedae", "embasa", "sanepar"] },
  { id: "enel", titulo: "Conta de luz", cor: "F5A800", texto: "⚡", palavras: ["enel", "cemig", "copel", "light sa", "coelba", "celesc", "cpfl", "equatorial", "energisa", "neoenergia"] },
];

const icones = [];
const faltaram = [];
for (const [id, palavras] of Object.entries(MARCAS)) {
  const chave = "si" + id.charAt(0).toUpperCase() + id.slice(1);
  const i = si[chave];
  if (!i) { faltaram.push(id); continue; }
  icones.push({ id, titulo: i.title, cor: i.hex, path: i.path, palavras });
}
const conteudo = `// Gerado por scripts/gerar-marcas.mjs — não edite à mão.
// Logos do projeto simple-icons (licença CC0); marcas são de seus donos.

export interface MarcaSvg {
  id: string;
  titulo: string;
  /** Cor oficial (hex sem #). */
  cor: string;
  /** Caminho SVG (viewBox 0 0 24 24) ou, nos selos, vazio. */
  path: string;
  /** Texto do selo, para marcas sem logo livre. */
  texto?: string;
  palavras: string[];
}

export const MARCAS_SVG: MarcaSvg[] = ${JSON.stringify([...icones, ...SELOS.map((s) => ({ ...s, path: "" }))], null, 0)};
`;
fs.writeFileSync(new URL("../src/features/dashboard/marcasSvg.ts", import.meta.url), conteudo);
console.log(`${icones.length} logos + ${SELOS.length} selos.${faltaram.length ? " Faltaram: " + faltaram.join(", ") : ""}`);
