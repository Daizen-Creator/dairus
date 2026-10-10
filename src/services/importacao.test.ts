import { describe, expect, it } from "vitest";
import { chaveDeDuplicidade, dataTextoParaISO, lerCsv, lerExtrato, lerOfx, valorTextoParaCentavos } from "./importacao";

// Tabela de casos: [texto, centavos esperados]. Valores conferidos à mão.
//
// Decisões (documentadas porque algumas entradas são ambíguas):
//  - Vírgula é SEMPRE decimal ("1,234" = R$ 1,23): extrato brasileiro não usa vírgula de milhar.
//  - Quando há vírgula e ponto juntos, o ÚLTIMO é o decimal ("1.234,56" e "1,234.56" = 1234,56).
//  - Ponto repetido é milhar ("1.234.567" = R$ 1.234.567,00).
//  - Ponto único seguido de exatamente 3 dígitos, com 1 a 3 dígitos antes (e não "0"), é milhar
//    no CSV brasileiro ("1.234" = R$ 1.234,00). Nos demais casos é decimal ("45.90", "1234.567").
//  - No OFX o ponto é SEMPRE decimal (é a regra do formato): "1.234" = R$ 1,23.
const CSV: Array<[string, number | null]> = [
  ["1.234,56", 123_456],
  ["1234,56", 123_456],
  ["1.234", 123_400], // milhar brasileiro sem vírgula (antes virava R$ 1,23)
  ["1.000", 100_000],
  ["100.000", 10_000_000],
  ["1,234", 123], // ambíguo: vírgula é decimal -> R$ 1,23
  ["(150,00)", -15_000],
  ["-150,00", -15_000],
  ["+150,00", 15_000],
  ["150,00-", -15_000], // alguns bancos põem o sinal no fim
  ["R$ 1.234,56", 123_456],
  ["-R$ 10,00", -1_000],
  ["R$ -1.234,56", -123_456],
  ["1234.56", 123_456], // ponto decimal (Nubank e outros)
  ["45.90", 4_590],
  ["10.5", 1_050],
  ["0.50", 50],
  ["0,5", 50],
  ["1.234.567,89", 123_456_789],
  ["1.234.567", 123_456_700],
  ["1,234.56", 123_456], // formato americano
  ["1234.567", 123_457], // 4 dígitos antes do ponto: não é milhar
  ["0.125", 13], // "0" antes do ponto: não é milhar
  ["150", 15_000],
  ["0,00", 0],
  ["", null],
  ["   ", null],
  ["abc", null],
  ["R$", null],
  [".", null],
];
const OFX: Array<[string, number | null]> = [
  ["-150.00", -15_000],
  ["1234.56", 123_456],
  ["1.234", 123], // no OFX o ponto é decimal
  ["-1234,56", -123_456], // vírgula também é aceita
  ["150", 15_000],
  ["(150.00)", -15_000],
  ["", null],
];

describe("valorTextoParaCentavos", () => {
  it.each(CSV)("CSV: %j -> %j", (texto, esperado) => {
    expect(valorTextoParaCentavos(texto)).toBe(esperado);
  });
  it.each(OFX)("OFX: %j -> %j", (texto, esperado) => {
    expect(valorTextoParaCentavos(texto, "ofx")).toBe(esperado);
  });
});

describe("datas", () => {
  it("aceita ISO, brasileira e OFX", () => {
    expect(dataTextoParaISO("2026-10-03")).toBe("2026-10-03");
    expect(dataTextoParaISO("03/10/2026")).toBe("2026-10-03");
    expect(dataTextoParaISO("03-10-2026")).toBe("2026-10-03");
    expect(dataTextoParaISO("20261003120000[-3:BRT]")).toBe("2026-10-03");
    expect(dataTextoParaISO("ontem")).toBeNull();
  });
});

describe("leitura de extratos", () => {
  it("OFX: valores com ponto decimal, sinal e descrição", () => {
    const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003120000[-3:BRT]<TRNAMT>-1234.56<FITID>1<MEMO>Aluguel</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>3500.00<FITID>2<NAME>Salario</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006<TRNAMT>0.00<FITID>3<MEMO>Zero</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261007<TRNAMT>-1.234<FITID>4</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    expect(lerOfx(ofx)).toEqual([
      { data: "2026-10-03", descricao: "Aluguel", valorCentavos: -123_456 },
      { data: "2026-10-05", descricao: "Salario", valorCentavos: 350_000 },
      { data: "2026-10-07", descricao: "Lançamento importado", valorCentavos: -123 },
    ]);
    // O nome ".ofx" ou o conteúdo escolhem o leitor certo.
    expect(lerExtrato("extrato.ofx", ofx)).toHaveLength(3);
  });

  it("CSV brasileiro (;): milhar com ponto e decimal com vírgula", () => {
    const csv = `Data;Histórico;Valor
03/10/2026;Aluguel;-1.234
04/10/2026;Salário;"3.500,00"
05/10/2026;Café;(12,50)
06/10/2026;Zerado;0,00`;
    expect(lerCsv(csv)).toEqual([
      { data: "2026-10-03", descricao: "Aluguel", valorCentavos: -123_400 },
      { data: "2026-10-04", descricao: "Salário", valorCentavos: 350_000 },
      { data: "2026-10-05", descricao: "Café", valorCentavos: -1_250 },
    ]);
  });

  it("CSV de fatura com ponto decimal e colunas de débito e crédito", () => {
    const fatura = `date,title,amount
2026-10-03,Mercado,45.90
2026-10-04,"Loja, centro",1234.56`;
    expect(lerCsv(fatura)).toEqual([
      { data: "2026-10-03", descricao: "Mercado", valorCentavos: 4_590 },
      { data: "2026-10-04", descricao: "Loja, centro", valorCentavos: 123_456 },
    ]);
    const dc = `Data;Descrição;Débito;Crédito
03/10/2026;Padaria;12,00;
04/10/2026;Pix recebido;;1.500,00`;
    expect(lerCsv(dc).map((l) => l.valorCentavos)).toEqual([-1_200, 150_000]);
  });

  it("CSV sem as colunas esperadas avisa com erro claro", () => {
    expect(() => lerCsv("a;b;c\n1;2;3")).toThrow(/colunas/);
  });

  it("chave de duplicidade ignora o sinal", () => {
    expect(chaveDeDuplicidade("2026-10-03", -123_400)).toBe("2026-10-03|123400");
  });
});
