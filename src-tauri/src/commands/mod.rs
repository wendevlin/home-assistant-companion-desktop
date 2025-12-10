//! Tauri commands exposed to the frontend.
//!
//! This module contains all the `#[tauri::command]` functions that
//! can be invoked from JavaScript via `invoke()`.

mod monitoring;
pub mod navigation;
mod servers;
pub mod settings;
pub mod window;

pub use monitoring::*;
pub use navigation::*;
pub use servers::*;
pub use settings::*;
pub use window::*;
