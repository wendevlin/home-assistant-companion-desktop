//! Home Assistant API client.
//!
//! This module handles communication with Home Assistant's mobile app
//! integration API, including device registration and sensor updates.

mod registration;
mod webhook;

pub use registration::register_device_with_sensors;
pub use webhook::update_sensors;
