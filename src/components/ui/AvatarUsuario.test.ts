import { describe, expect, it } from "vitest";
import { corDoNome, fotoEmAltaResolucao, iniciais } from "./AvatarUsuario";

describe("avatar do usuário", () => {
  it("iniciais do nome (ou do e-mail)", () => {
    expect(iniciais("Daniel Santos")).toBe("DS");
    expect(iniciais("Maria da Silva Souza")).toBe("MS");
    expect(iniciais("ana")).toBe("A");
    expect(iniciais("joao.p@gmail.com")).toBe("J");
    expect(iniciais("  ")).toBe("?");
  });

  it("foto do Google em resolução maior e cor estável por nome", () => {
    expect(fotoEmAltaResolucao("https://lh3.googleusercontent.com/a/ABC=s96-c")).toBe("https://lh3.googleusercontent.com/a/ABC=s256-c");
    expect(fotoEmAltaResolucao("https://exemplo.com/foto.png")).toBe("https://exemplo.com/foto.png");
    expect(corDoNome("Daniel")).toBe(corDoNome("Daniel"));
    expect(corDoNome("Daniel")).not.toBe(corDoNome("Ana"));
  });
});
