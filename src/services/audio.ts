// Gravação de voz para a IA. O WebView grava em WebM/Opus, que o Gemini não aceita
// em todos os modelos; convertemos para WAV mono 16 kHz (aceito por todos).

export interface Gravacao {
  parar: () => Promise<Blob>;
  cancelar: () => void;
}

export async function iniciarGravacao(): Promise<Gravacao> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este computador não oferece acesso ao microfone.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
    throw new Error("Sem permissão para usar o microfone. Libere o acesso nas configurações de privacidade do Windows.");
  });
  const gravador = new MediaRecorder(stream);
  const pedacos: Blob[] = [];
  gravador.ondataavailable = (e) => e.data.size && pedacos.push(e.data);
  gravador.start();
  const desligar = () => stream.getTracks().forEach((t) => t.stop());
  return {
    cancelar: () => {
      gravador.stop();
      desligar();
    },
    parar: () =>
      new Promise<Blob>((resolve, reject) => {
        gravador.onstop = async () => {
          desligar();
          try {
            resolve(await paraWav(new Blob(pedacos, { type: gravador.mimeType })));
          } catch (e) {
            reject(e);
          }
        };
        gravador.stop();
      }),
  };
}

/** Converte qualquer áudio que o navegador decodifica para WAV PCM 16 bits mono 16 kHz. */
export async function paraWav(audio: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const decodificado = await ctx.decodeAudioData(await audio.arrayBuffer());
    const taxa = 16_000;
    const offline = new OfflineAudioContext(1, Math.ceil(decodificado.duration * taxa), taxa);
    const fonte = offline.createBufferSource();
    fonte.buffer = decodificado;
    fonte.connect(offline.destination);
    fonte.start();
    const mono = (await offline.startRendering()).getChannelData(0);
    return new Blob([codificarWav(mono, taxa)], { type: "audio/wav" });
  } finally {
    ctx.close().catch(() => {});
  }
}

export function codificarWav(amostras: Float32Array, taxa: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + amostras.length * 2);
  const v = new DataView(buf);
  const texto = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  texto(0, "RIFF");
  v.setUint32(4, 36 + amostras.length * 2, true);
  texto(8, "WAVE");
  texto(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, taxa, true);
  v.setUint32(28, taxa * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  texto(36, "data");
  v.setUint32(40, amostras.length * 2, true);
  for (let i = 0; i < amostras.length; i++) {
    const s = Math.max(-1, Math.min(1, amostras[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}
