//! Criptografia do banco e dos backups.
//!
//! Com a criptografia ligada, o banco da conta fica no disco só cifrado
//! (`dairus.db.cripto`). Ao entrar, ele é decifrado direto para a memória
//! (nada em texto aberto vai para o disco) e, enquanto o app está aberto, é
//! gravado de volta, cifrado, sempre que algo muda e ao sair.
//!
//! Formato do arquivo:
//!   "DAIRUSC1" | u32 LE (tamanho do cabeçalho) | cabeçalho JSON | nonce (12) | dados cifrados
//! Os dados são cifrados com AES-256-GCM por uma chave aleatória (a "chave dos
//! dados"). O cabeçalho guarda essa chave cifrada duas vezes: com a senha e com
//! o código de recuperação (ambos passam por Argon2id). O cabeçalho entra como
//! dado autenticado, então não dá para trocá-lo sem a decifragem falhar.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use aes_gcm::aead::{rand_core::RngCore, Aead, KeyInit, OsRng, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, Zeroizing};

type Res<T> = Result<T, String>;

const MAGICO: &[u8; 8] = b"DAIRUSC1";

#[cfg(not(test))]
const ARGON_MEMORIA_KIB: u32 = 64 * 1024;
#[cfg(not(test))]
const ARGON_PASSOS: u32 = 3;
// Nos testes, parâmetros leves (só para não demorar).
#[cfg(test)]
const ARGON_MEMORIA_KIB: u32 = 1024;
#[cfg(test)]
const ARGON_PASSOS: u32 = 1;

pub const SENHA_MINIMA: usize = 8;

#[derive(Serialize, Deserialize, Clone)]
struct ChaveEmbrulhada {
    sal: String,
    nonce: String,
    cifrada: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct Cabecalho {
    v: u32,
    memoria_kib: u32,
    passos: u32,
    senha: ChaveEmbrulhada,
    codigo: ChaveEmbrulhada,
}

/// Chave dos dados + cabeçalho que a acompanha nos arquivos gravados.
pub struct Chaves {
    dados: Zeroizing<[u8; 32]>,
    cabecalho: Vec<u8>,
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn de_hex(s: &str) -> Res<Vec<u8>> {
    if s.len() % 2 != 0 {
        return Err("Arquivo criptografado corrompido.".into());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| "Arquivo criptografado corrompido.".to_string()))
        .collect()
}

fn aleatorio<const N: usize>() -> [u8; N] {
    let mut b = [0u8; N];
    OsRng.fill_bytes(&mut b);
    b
}

fn derivar(segredo: &str, sal: &[u8], memoria_kib: u32, passos: u32) -> Res<Zeroizing<[u8; 32]>> {
    let params = argon2::Params::new(memoria_kib, passos, 1, Some(32)).map_err(|e| e.to_string())?;
    let a = argon2::Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    let mut chave = Zeroizing::new([0u8; 32]);
    a.hash_password_into(segredo.as_bytes(), sal, chave.as_mut()).map_err(|e| e.to_string())?;
    Ok(chave)
}

fn embrulhar(dados: &[u8; 32], segredo: &str, memoria_kib: u32, passos: u32) -> Res<ChaveEmbrulhada> {
    let sal: [u8; 16] = aleatorio();
    let nonce: [u8; 12] = aleatorio();
    let kek = derivar(segredo, &sal, memoria_kib, passos)?;
    let cifra = Aes256Gcm::new_from_slice(kek.as_ref()).map_err(|e| e.to_string())?;
    let cifrada = cifra.encrypt(Nonce::from_slice(&nonce), dados.as_ref()).map_err(|_| "Falha ao cifrar a chave.".to_string())?;
    Ok(ChaveEmbrulhada { sal: hex(&sal), nonce: hex(&nonce), cifrada: hex(&cifrada) })
}

fn desembrulhar(e: &ChaveEmbrulhada, segredo: &str, memoria_kib: u32, passos: u32) -> Option<Zeroizing<[u8; 32]>> {
    let kek = derivar(segredo, &de_hex(&e.sal).ok()?, memoria_kib, passos).ok()?;
    let cifra = Aes256Gcm::new_from_slice(kek.as_ref()).ok()?;
    let mut aberta = cifra.decrypt(Nonce::from_slice(&de_hex(&e.nonce).ok()?), de_hex(&e.cifrada).ok()?.as_ref()).ok()?;
    if aberta.len() != 32 {
        aberta.zeroize();
        return None;
    }
    let mut chave = Zeroizing::new([0u8; 32]);
    chave.copy_from_slice(&aberta);
    aberta.zeroize();
    Some(chave)
}

/// Código de recuperação legível: 5 grupos de 4 caracteres (sem 0/O/1/I para não confundir).
fn gerar_codigo() -> String {
    const ALFABETO: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let bytes: [u8; 20] = aleatorio();
    let letras: Vec<char> = bytes.iter().map(|b| ALFABETO[(*b as usize) % ALFABETO.len()] as char).collect();
    letras.chunks(4).map(|g| g.iter().collect::<String>()).collect::<Vec<_>>().join("-")
}

/// O usuário pode digitar o código com espaços, minúsculas ou sem hífens.
fn normalizar_codigo(codigo: &str) -> String {
    let limpo: String = codigo.chars().filter(|c| c.is_ascii_alphanumeric()).map(|c| c.to_ascii_uppercase()).collect();
    limpo.as_bytes().chunks(4).map(|g| String::from_utf8_lossy(g).into_owned()).collect::<Vec<_>>().join("-")
}

pub fn validar_senha(senha: &str) -> Res<()> {
    if senha.chars().count() < SENHA_MINIMA {
        return Err(format!("A senha precisa ter pelo menos {SENHA_MINIMA} caracteres."));
    }
    Ok(())
}

impl Chaves {
    /// Novas chaves para uma senha. Devolve também o código de recuperação (mostrar uma vez só).
    pub fn novas(senha: &str) -> Res<(Chaves, String)> {
        validar_senha(senha)?;
        let dados = Zeroizing::new(aleatorio::<32>());
        let codigo = gerar_codigo();
        let cab = Cabecalho {
            v: 1,
            memoria_kib: ARGON_MEMORIA_KIB,
            passos: ARGON_PASSOS,
            senha: embrulhar(&dados, senha, ARGON_MEMORIA_KIB, ARGON_PASSOS)?,
            codigo: embrulhar(&dados, &codigo, ARGON_MEMORIA_KIB, ARGON_PASSOS)?,
        };
        let cabecalho = serde_json::to_vec(&cab).map_err(|e| e.to_string())?;
        Ok((Chaves { dados, cabecalho }, codigo))
    }

    /// Mesma chave dos dados e mesmo código de recuperação, com outra senha.
    pub fn com_nova_senha(&self, nova: &str) -> Res<Chaves> {
        validar_senha(nova)?;
        let mut cab: Cabecalho = serde_json::from_slice(&self.cabecalho).map_err(|e| e.to_string())?;
        cab.senha = embrulhar(&self.dados, nova, cab.memoria_kib, cab.passos)?;
        Ok(Chaves { dados: self.dados.clone(), cabecalho: serde_json::to_vec(&cab).map_err(|e| e.to_string())? })
    }

    pub fn cifrar(&self, texto: &[u8]) -> Res<Vec<u8>> {
        let nonce: [u8; 12] = aleatorio();
        let cifra = Aes256Gcm::new_from_slice(self.dados.as_ref()).map_err(|e| e.to_string())?;
        let cifrado = cifra
            .encrypt(Nonce::from_slice(&nonce), Payload { msg: texto, aad: &self.cabecalho })
            .map_err(|_| "Falha ao cifrar os dados.".to_string())?;
        let mut saida = Vec::with_capacity(8 + 4 + self.cabecalho.len() + 12 + cifrado.len());
        saida.extend_from_slice(MAGICO);
        saida.extend_from_slice(&(self.cabecalho.len() as u32).to_le_bytes());
        saida.extend_from_slice(&self.cabecalho);
        saida.extend_from_slice(&nonce);
        saida.extend_from_slice(&cifrado);
        Ok(saida)
    }
}

pub fn eh_cifrado(bytes: &[u8]) -> bool {
    bytes.len() > 12 && &bytes[..8] == MAGICO
}

struct Partes<'a> {
    cabecalho_bruto: &'a [u8],
    cabecalho: Cabecalho,
    nonce: &'a [u8],
    cifrado: &'a [u8],
}

fn separar(bytes: &[u8]) -> Res<Partes<'_>> {
    if !eh_cifrado(bytes) {
        return Err("O arquivo não está criptografado pelo Dairus.".into());
    }
    let n = u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize;
    if bytes.len() < 12 + n + 12 + 16 {
        return Err("Arquivo criptografado incompleto ou corrompido.".into());
    }
    let cabecalho_bruto = &bytes[12..12 + n];
    let cabecalho: Cabecalho = serde_json::from_slice(cabecalho_bruto).map_err(|_| "Arquivo criptografado corrompido.".to_string())?;
    Ok(Partes { cabecalho_bruto, cabecalho, nonce: &bytes[12 + n..12 + n + 12], cifrado: &bytes[12 + n + 12..] })
}

fn abrir_com(p: Partes<'_>, dados: Zeroizing<[u8; 32]>) -> Res<(Chaves, Zeroizing<Vec<u8>>)> {
    let cifra = Aes256Gcm::new_from_slice(dados.as_ref()).map_err(|e| e.to_string())?;
    let texto = cifra
        .decrypt(Nonce::from_slice(p.nonce), Payload { msg: p.cifrado, aad: p.cabecalho_bruto })
        .map_err(|_| "O arquivo foi alterado ou está corrompido.".to_string())?;
    Ok((Chaves { dados, cabecalho: p.cabecalho_bruto.to_vec() }, Zeroizing::new(texto)))
}

/// Decifra com a senha. Erro claro quando a senha está errada.
pub fn abrir_com_senha(bytes: &[u8], senha: &str) -> Res<(Chaves, Zeroizing<Vec<u8>>)> {
    let p = separar(bytes)?;
    let dados = desembrulhar(&p.cabecalho.senha, senha, p.cabecalho.memoria_kib, p.cabecalho.passos).ok_or("Senha incorreta.")?;
    abrir_com(p, dados)
}

/// Decifra com o código de recuperação (quando a senha foi esquecida).
pub fn abrir_com_codigo(bytes: &[u8], codigo: &str) -> Res<(Chaves, Zeroizing<Vec<u8>>)> {
    let p = separar(bytes)?;
    let dados = desembrulhar(&p.cabecalho.codigo, &normalizar_codigo(codigo), p.cabecalho.memoria_kib, p.cabecalho.passos)
        .ok_or("Código de recuperação incorreto.")?;
    abrir_com(p, dados)
}

// ---------------------------------------------------------------------------
// Sessão: a conta aberta com criptografia ligada.

pub struct Sessao {
    chaves: Chaves,
    senha: Zeroizing<String>,
    arquivo: PathBuf,
    mudancas_gravadas: u64,
}

static SESSAO: Mutex<Option<Sessao>> = Mutex::new(None);

pub fn ativa() -> bool {
    SESSAO.lock().expect("mutex envenenado").is_some()
}

pub fn iniciar_sessao(chaves: Chaves, senha: &str, arquivo: PathBuf, conn: &Connection) {
    *SESSAO.lock().expect("mutex envenenado") =
        Some(Sessao { chaves, senha: Zeroizing::new(senha.to_string()), arquivo, mudancas_gravadas: conn.total_changes() });
}

pub fn encerrar_sessao() {
    *SESSAO.lock().expect("mutex envenenado") = None;
}

pub fn arquivo_da_sessao() -> Option<PathBuf> {
    SESSAO.lock().expect("mutex envenenado").as_ref().map(|s| s.arquivo.clone())
}

/// Copia o banco inteiro para bytes (funciona com banco em memória ou em arquivo).
pub fn serializar(conn: &Connection) -> Res<Vec<u8>> {
    Ok(conn.serialize(rusqlite::MAIN_DB).map_err(|e| e.to_string())?.to_vec())
}

/// Abre na memória um banco que está em bytes (decifrado).
pub fn banco_em_memoria(bytes: &[u8]) -> Res<Connection> {
    let mut copia = Zeroizing::new(bytes.to_vec());
    // Um banco salvo em modo WAL marca isso no cabeçalho (bytes 18 e 19 = 2);
    // na memória ele precisa estar no modo comum (1), senão o SQLite recusa.
    if copia.len() > 19 && copia[18] == 2 && copia[19] == 2 {
        copia[18] = 1;
        copia[19] = 1;
    }
    let mut conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
    conn.deserialize_read_exact(rusqlite::MAIN_DB, &copia[..], copia.len(), false).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON").map_err(|e| e.to_string())?;
    Ok(conn)
}

fn gravar_atomico(destino: &Path, bytes: &[u8]) -> Res<()> {
    let tmp = destino.with_extension("cripto.tmp");
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, destino).map_err(|e| e.to_string())
}

/// Grava o banco (cifrado) se mudou desde a última gravação, ou sempre com `forcar`.
pub fn persistir(conn: &Connection, forcar: bool) -> Res<bool> {
    let mut guarda = SESSAO.lock().expect("mutex envenenado");
    let Some(s) = guarda.as_mut() else { return Ok(false) };
    let mudancas = conn.total_changes();
    if !forcar && mudancas == s.mudancas_gravadas {
        return Ok(false);
    }
    let texto = Zeroizing::new(serializar(conn)?);
    gravar_atomico(&s.arquivo, &s.chaves.cifrar(&texto)?)?;
    s.mudancas_gravadas = mudancas;
    Ok(true)
}

/// Bytes para um arquivo de backup: cifrados se a criptografia está ligada.
pub fn bytes_de_backup(conn: &Connection) -> Res<Option<Vec<u8>>> {
    let guarda = SESSAO.lock().expect("mutex envenenado");
    let Some(s) = guarda.as_ref() else { return Ok(None) };
    let texto = Zeroizing::new(serializar(conn)?);
    Ok(Some(s.chaves.cifrar(&texto)?))
}

/// Abre um arquivo de banco/backup, cifrado (com a senha da sessão) ou não.
/// Bancos cifrados abrem só na memória.
pub fn abrir_arquivo(caminho: &Path) -> Res<Connection> {
    let bytes = std::fs::read(caminho).map_err(|e| e.to_string())?;
    if eh_cifrado(&bytes) {
        let senha = SESSAO
            .lock()
            .expect("mutex envenenado")
            .as_ref()
            .map(|s| s.senha.clone())
            .ok_or("Este backup está criptografado. Ligue a criptografia com a mesma senha para abri-lo.")?;
        let (_, texto) = abrir_com_senha(&bytes, &senha)
            .map_err(|e| if e == "Senha incorreta." { "Este backup foi criptografado com outra senha.".to_string() } else { e })?;
        banco_em_memoria(&texto)
    } else {
        Connection::open_with_flags(caminho, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| e.to_string())
    }
}

pub fn senha_confere(senha: &str) -> bool {
    SESSAO.lock().expect("mutex envenenado").as_ref().is_some_and(|s| s.senha.as_str() == senha)
}

/// Troca a senha da sessão (o arquivo é regravado com o cabeçalho novo).
pub fn trocar_senha(conn: &Connection, atual: &str, nova: &str) -> Res<()> {
    {
        let mut guarda = SESSAO.lock().expect("mutex envenenado");
        let s = guarda.as_mut().ok_or("A criptografia não está ligada.")?;
        if s.senha.as_str() != atual {
            return Err("Senha atual incorreta.".into());
        }
        s.chaves = s.chaves.com_nova_senha(nova)?;
        s.senha = Zeroizing::new(nova.to_string());
    }
    persistir(conn, true).map(|_| ())
}

/// Recifra (ou decifra) os backups da pasta ao ligar/desligar a criptografia.
pub fn converter_backups(pasta: &Path, cifrar: bool) -> usize {
    let Ok(entradas) = std::fs::read_dir(pasta) else { return 0 };
    let mut n = 0;
    for caminho in entradas.filter_map(|e| e.ok()).map(|e| e.path()) {
        if !caminho.extension().is_some_and(|x| x == "db") {
            continue;
        }
        let Ok(bytes) = std::fs::read(&caminho) else { continue };
        let ja_cifrado = eh_cifrado(&bytes);
        let novo = if cifrar && !ja_cifrado {
            let guarda = SESSAO.lock().expect("mutex envenenado");
            guarda.as_ref().and_then(|s| s.chaves.cifrar(&bytes).ok())
        } else if !cifrar && ja_cifrado {
            abrir_arquivo(&caminho).ok().and_then(|c| serializar(&c).ok())
        } else {
            None
        };
        if let Some(novo) = novo {
            let tmp = caminho.with_extension("db.tmp");
            if std::fs::write(&tmp, &novo).is_ok() && std::fs::rename(&tmp, &caminho).is_ok() {
                n += 1;
            }
        }
    }
    n
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn cifra_e_decifra_com_senha_e_com_codigo() {
        let (ch, codigo) = Chaves::novas("senha-forte-1").unwrap();
        let arquivo = ch.cifrar(b"dados secretos").unwrap();
        assert!(eh_cifrado(&arquivo));
        assert!(!arquivo.windows(14).any(|w| w == b"dados secretos"));

        let (_, texto) = abrir_com_senha(&arquivo, "senha-forte-1").unwrap();
        assert_eq!(texto.as_slice(), b"dados secretos");
        assert_eq!(abrir_com_senha(&arquivo, "errada!!").err().as_deref(), Some("Senha incorreta."));

        let digitado = codigo.to_lowercase().replace('-', " ");
        let (ch2, texto2) = abrir_com_codigo(&arquivo, &digitado).unwrap();
        assert_eq!(texto2.as_slice(), b"dados secretos");

        // Recuperação: nova senha, mesmo código.
        let ch3 = ch2.com_nova_senha("outra-senha-2").unwrap();
        let regravado = ch3.cifrar(b"x").unwrap();
        assert!(abrir_com_senha(&regravado, "outra-senha-2").is_ok());
        assert!(abrir_com_senha(&regravado, "senha-forte-1").is_err());
        assert!(abrir_com_codigo(&regravado, &codigo).is_ok());
    }

    #[test]
    fn detecta_adulteracao_e_senha_curta() {
        let (ch, _) = Chaves::novas("senha-forte-1").unwrap();
        let mut arquivo = ch.cifrar(b"abc").unwrap();
        let ultimo = arquivo.len() - 1;
        arquivo[ultimo] ^= 1;
        assert!(abrir_com_senha(&arquivo, "senha-forte-1").is_err());
        assert!(Chaves::novas("curta").is_err());
    }

    #[test]
    fn banco_vai_e_volta_pela_memoria() {
        let conn = crate::db::abrir_conexao(Path::new(":memory:")).unwrap();
        crate::db::executar_migracoes(&conn).unwrap();
        let bytes = serializar(&conn).unwrap();
        let (ch, _) = Chaves::novas("senha-forte-1").unwrap();
        let cifrado = ch.cifrar(&bytes).unwrap();
        let (_, texto) = abrir_com_senha(&cifrado, "senha-forte-1").unwrap();
        let copia = banco_em_memoria(&texto).unwrap();
        let n: i64 = copia.query_row("SELECT COUNT(*) FROM contas_contabeis", [], |r| r.get(0)).unwrap();
        assert!(n > 10);
    }

    #[test]
    fn banco_salvo_em_wal_abre_na_memoria() {
        let pasta = std::env::temp_dir().join(format!("dairus-cripto-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&pasta).unwrap();
        let caminho = pasta.join("a.db");
        {
            let conn = crate::db::abrir_conexao(&caminho).unwrap();
            crate::db::executar_migracoes(&conn).unwrap();
        }
        let bytes = std::fs::read(&caminho).unwrap();
        assert_eq!(bytes[18], 2);
        let conn = banco_em_memoria(&bytes).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM contas_contabeis", [], |r| r.get(0)).unwrap();
        assert!(n > 10);
        conn.execute("UPDATE contas_contabeis SET nome = 'X' WHERE id = 'ativo-dinheiro'", []).unwrap();
        let _ = std::fs::remove_dir_all(pasta);
    }

    #[test]
    fn sessao_grava_cifrado_quando_muda_e_abre_backup_cifrado() {
        let pasta = std::env::temp_dir().join(format!("dairus-sessao-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&pasta).unwrap();
        let arquivo = pasta.join("dairus.db.cripto");
        let conn = crate::db::abrir_conexao(Path::new(":memory:")).unwrap();
        crate::db::executar_migracoes(&conn).unwrap();
        let (ch, _) = Chaves::novas("senha-forte-1").unwrap();
        iniciar_sessao(ch, "senha-forte-1", arquivo.clone(), &conn);

        assert!(!persistir(&conn, false).unwrap(), "sem mudança não grava");
        conn.execute("UPDATE contas_contabeis SET nome = 'Carteira secreta' WHERE id = 'ativo-dinheiro'", []).unwrap();
        assert!(persistir(&conn, false).unwrap());
        let bytes = std::fs::read(&arquivo).unwrap();
        assert!(eh_cifrado(&bytes));
        assert!(!bytes.windows(16).any(|w| w == b"Carteira secreta"));
        let (_, texto) = abrir_com_senha(&bytes, "senha-forte-1").unwrap();
        let reaberto = banco_em_memoria(&texto).unwrap();
        let nome: String = reaberto.query_row("SELECT nome FROM contas_contabeis WHERE id = 'ativo-dinheiro'", [], |r| r.get(0)).unwrap();
        assert_eq!(nome, "Carteira secreta");

        // Backup cifrado abre com a senha da sessão; backup aberto é convertido ao ligar.
        let backup = pasta.join("dairus-1.db");
        std::fs::write(&backup, bytes_de_backup(&conn).unwrap().unwrap()).unwrap();
        assert!(abrir_arquivo(&backup).is_ok());
        let aberto = pasta.join("dairus-2.db");
        conn.backup(rusqlite::MAIN_DB, &aberto, None).unwrap();
        assert_eq!(converter_backups(&pasta, true), 1);
        assert!(eh_cifrado(&std::fs::read(&aberto).unwrap()));
        assert_eq!(converter_backups(&pasta, false), 2);
        assert!(!eh_cifrado(&std::fs::read(&backup).unwrap()));

        trocar_senha(&conn, "senha-forte-1", "nova-senha-22").unwrap();
        assert!(abrir_com_senha(&std::fs::read(&arquivo).unwrap(), "nova-senha-22").is_ok());
        encerrar_sessao();
        assert!(!ativa());
        let _ = std::fs::remove_dir_all(pasta);
    }
}
