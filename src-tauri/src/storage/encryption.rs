//! Encryption utilities for secure configuration storage.
//!
//! Uses AES-256-GCM for authenticated encryption. The encryption key
//! is stored in the OS keyring when available, with a file-based
//! fallback for systems without keyring support.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use keyring::Entry;
use rand::Rng;
use std::fs;

const KEYRING_SERVICE: &str = "home-assistant-companion-desktop";
const KEYRING_USER: &str = "vault-key";
const NONCE_SIZE: usize = 12;

/// Gets or creates the encryption key.
///
/// Tries the OS keyring first, falling back to file-based storage
/// if the keyring is unavailable.
pub fn get_or_create_vault_key() -> Result<[u8; 32], String> {
    // Try keyring first
    match get_key_from_keyring() {
        Ok(key) => return Ok(key),
        Err(e) => {
            println!(
                "HA Desktop: Keyring unavailable ({}), using file fallback",
                e
            );
        }
    }

    // Fallback to file-based key storage
    get_key_from_file()
}

/// Encrypts data using AES-256-GCM.
///
/// Returns base64-encoded ciphertext with prepended nonce.
pub fn encrypt_data(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;

    // Generate random nonce
    let mut nonce_bytes = [0u8; NONCE_SIZE];
    rand::thread_rng().fill(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Encrypt
    let ciphertext = cipher.encrypt(nonce, plaintext).map_err(|e| e.to_string())?;

    // Prepend nonce to ciphertext
    let mut result = nonce_bytes.to_vec();
    result.extend(ciphertext);

    // Encode as base64 for safe storage
    Ok(BASE64.encode(&result).into_bytes())
}

/// Decrypts data using AES-256-GCM.
///
/// Expects base64-encoded input with prepended nonce.
pub fn decrypt_data(key: &[u8; 32], encrypted: &[u8]) -> Result<Vec<u8>, String> {
    // Decode from base64
    let encrypted_str = String::from_utf8(encrypted.to_vec()).map_err(|e| e.to_string())?;
    let data = BASE64.decode(&encrypted_str).map_err(|e| e.to_string())?;

    if data.len() < NONCE_SIZE {
        return Err("Invalid encrypted data".to_string());
    }

    // Extract nonce and ciphertext
    let nonce = Nonce::from_slice(&data[..NONCE_SIZE]);
    let ciphertext = &data[NONCE_SIZE..];

    // Decrypt
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    cipher.decrypt(nonce, ciphertext).map_err(|e| e.to_string())
}

/// Gets or creates the encryption key from the OS keyring.
fn get_key_from_keyring() -> Result<[u8; 32], String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;

    match entry.get_password() {
        Ok(key_b64) => {
            println!("HA Desktop: Found existing encryption key in keyring");
            decode_key(&key_b64)
        }
        Err(keyring::Error::NoEntry) => {
            println!("HA Desktop: Generating new encryption key");
            let key = generate_key();
            let key_b64 = BASE64.encode(key);
            entry.set_password(&key_b64).map_err(|e| e.to_string())?;
            println!("HA Desktop: Encryption key stored in keyring");
            Ok(key)
        }
        Err(e) => Err(format!("Keyring error: {}", e)),
    }
}

/// Gets or creates the encryption key from a file.
fn get_key_from_file() -> Result<[u8; 32], String> {
    let key_path = dirs::data_local_dir()
        .ok_or("Could not determine local data directory")?
        .join("home-assistant-companion-desktop")
        .join(".vault_key");

    if key_path.exists() {
        // Load existing key
        let key_b64 = fs::read_to_string(&key_path).map_err(|e| e.to_string())?;
        println!("HA Desktop: Found existing encryption key in file");
        decode_key(key_b64.trim())
    } else {
        // Generate new key
        println!("HA Desktop: Generating new encryption key (file fallback)");
        let key = generate_key();
        let key_b64 = BASE64.encode(key);

        // Ensure parent directory exists
        if let Some(parent) = key_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        fs::write(&key_path, &key_b64).map_err(|e| e.to_string())?;

        // Set restrictive permissions on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = std::fs::Permissions::from_mode(0o600);
            let _ = fs::set_permissions(&key_path, perms);
        }

        println!("HA Desktop: Encryption key stored in file");
        Ok(key)
    }
}

/// Generates a new random 256-bit key.
fn generate_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    rand::thread_rng().fill(&mut key);
    key
}

/// Decodes a base64-encoded key.
fn decode_key(key_b64: &str) -> Result<[u8; 32], String> {
    let key_bytes = BASE64.decode(key_b64).map_err(|e| e.to_string())?;
    if key_bytes.len() != 32 {
        return Err("Invalid key length".to_string());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&key_bytes);
    Ok(key)
}
